import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { Readable } from "stream";

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
    // Required for Cloudflare R2 path-style addressing
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET must be set");
  return bucket;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const key = `uploads/${objectId}`;
    const s3 = getS3Client();
    const command = new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 900 });
    return url;
  }

  async getObjectEntityKey(objectPath: string): Promise<string> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const key = objectPath.slice("/objects/".length);
    if (!key) throw new ObjectNotFoundError();

    const s3 = getS3Client();
    try {
      await s3.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    } catch {
      throw new ObjectNotFoundError();
    }
    return key;
  }

  async downloadObject(objectPath: string, cacheTtlSec: number = 3600): Promise<Response> {
    const key = await this.getObjectEntityKey(objectPath);
    const s3 = getS3Client();
    const result = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));

    const body = result.Body as NodeJS.ReadableStream;
    const webStream = Readable.toWeb(body as any) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": result.ContentType || "application/octet-stream",
      "Cache-Control": `private, max-age=${cacheTtlSec}`,
    };
    if (result.ContentLength) {
      headers["Content-Length"] = String(result.ContentLength);
    }

    return new Response(webStream, { headers });
  }

  async getSignedDownloadUrl(objectPath: string, ttlSec: number = 3600): Promise<string> {
    const key = await this.getObjectEntityKey(objectPath);
    const s3 = getS3Client();
    const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
    return getSignedUrl(s3, command, { expiresIn: ttlSec });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // If it's already a /objects/ path, return as-is
    if (rawPath.startsWith("/objects/")) return rawPath;
    // If it's a full S3/R2 URL, extract the key
    try {
      const url = new URL(rawPath);
      const key = url.pathname.replace(/^\/[^/]+\//, ""); // strip /bucket-name/
      return `/objects/${key}`;
    } catch {
      return rawPath;
    }
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: { owner: string; visibility: "public" | "private" },
  ): Promise<string> {
    // S3-based ACL is stored in DB (filesTable.visibility), not object metadata.
    // This method just normalizes and returns the path; callers update the DB.
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity({
    userId,
    objectPath,
    visibility,
    ownerId,
  }: {
    userId?: string;
    objectPath: string;
    visibility?: "public" | "private";
    ownerId?: string;
  }): Promise<boolean> {
    if (visibility === "public") return true;
    if (!userId) return false;
    return userId === ownerId;
  }
}
