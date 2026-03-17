import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { db, filesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { badRequest } from "../lib/errors";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, size, contentType } = req.body;
    if (!name || !contentType) throw badRequest("name and contentType are required");

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath, finalizeURL: "/api/storage/uploads/finalize", metadata: { name, size, contentType } });
  } catch (err) {
    next(err);
  }
});

router.post("/storage/uploads/finalize", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { objectPath } = req.body;
    if (!objectPath || typeof objectPath !== "string") throw badRequest("objectPath is required");

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, { owner: userId, visibility: "private" });
    res.json({ success: true, objectPath });
  } catch (err) {
    next(err);
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const userId = req.user?.id;

    // Enforce ownership: look up the file record
    if (userId) {
      const [fileRecord] = await db
        .select()
        .from(filesTable)
        .where(and(eq(filesTable.storageKey, objectPath), eq(filesTable.userId, userId)));

      if (!fileRecord) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectPath);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    next(err);
  }
});

export default router;
