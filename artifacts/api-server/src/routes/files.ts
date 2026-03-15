import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { filesTable, leadFilesTable, contactFilesTable, leadsTable, contactsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { parseIntParam, notFound, badRequest } from "../lib/errors";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const objectStorageService = new ObjectStorageService();

async function verifyLeadOwnership(leadId: number, userId: string): Promise<boolean> {
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.userId, userId)));
  return !!lead;
}

async function verifyContactOwnership(contactId: number, userId: string): Promise<boolean> {
  const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, userId)));
  return !!contact;
}

async function uploadToStorage(file: any): Promise<string> {
  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  const response = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.mimetype }, body: file.buffer });
  if (!response.ok) throw new Error("Failed to upload file to storage");
  return objectPath;
}

router.get("/files", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const results = await db.select().from(filesTable).where(eq(filesTable.userId, userId));
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/files/upload", upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const file = (req as any).file;
    if (!file) throw badRequest("No file provided");

    const objectPath = await uploadToStorage(file);
    const [record] = await db.insert(filesTable).values({
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storageKey: objectPath,
      userId,
    }).returning();

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.delete("/files/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const fileId = parseIntParam(req.params.id);
    const result = await db.delete(filesTable).where(and(eq(filesTable.id, fileId), eq(filesTable.userId, userId))).returning();
    if (result.length === 0) throw notFound();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/leads/:id/files", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.id);
    if (!(await verifyLeadOwnership(leadId, userId))) throw notFound();

    const joins = await db.select().from(leadFilesTable).where(eq(leadFilesTable.leadId, leadId));
    if (joins.length === 0) { res.json([]); return; }
    const fileIds = joins.map((j) => j.fileId);
    const files = await db.select().from(filesTable).where(inArray(filesTable.id, fileIds));
    res.json(files);
  } catch (err) {
    next(err);
  }
});

router.post("/leads/:id/files", upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.id);
    if (!(await verifyLeadOwnership(leadId, userId))) throw notFound();

    const { fileId } = req.body;
    if (fileId) {
      const fid = parseIntParam(String(fileId), "fileId");
      const [owned] = await db.select().from(filesTable).where(and(eq(filesTable.id, fid), eq(filesTable.userId, userId)));
      if (!owned) throw notFound("File not found");
      await db.insert(leadFilesTable).values({ leadId, fileId: fid });
      res.status(201).json({ success: true });
      return;
    }

    const file = (req as any).file;
    if (!file) throw badRequest("No file or fileId provided");

    const objectPath = await uploadToStorage(file);
    const [record] = await db.insert(filesTable).values({
      name: file.originalname, mimeType: file.mimetype, size: file.size, storageKey: objectPath, userId,
    }).returning();

    await db.insert(leadFilesTable).values({ leadId, fileId: record.id });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.delete("/leads/:leadId/files/:fileId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.leadId, "leadId");
    const fileId = parseIntParam(req.params.fileId, "fileId");
    if (!(await verifyLeadOwnership(leadId, userId))) throw notFound();

    const result = await db.delete(leadFilesTable).where(and(
      eq(leadFilesTable.leadId, leadId),
      eq(leadFilesTable.fileId, fileId)
    )).returning();
    if (result.length === 0) throw notFound();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/contacts/:id/files", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const contactId = parseIntParam(req.params.id);
    if (!(await verifyContactOwnership(contactId, userId))) throw notFound();

    const joins = await db.select().from(contactFilesTable).where(eq(contactFilesTable.contactId, contactId));
    if (joins.length === 0) { res.json([]); return; }
    const fileIds = joins.map((j) => j.fileId);
    const files = await db.select().from(filesTable).where(inArray(filesTable.id, fileIds));
    res.json(files);
  } catch (err) {
    next(err);
  }
});

router.post("/contacts/:id/files", upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const contactId = parseIntParam(req.params.id);
    if (!(await verifyContactOwnership(contactId, userId))) throw notFound();

    const { fileId } = req.body;
    if (fileId) {
      const fid = parseIntParam(String(fileId), "fileId");
      const [owned] = await db.select().from(filesTable).where(and(eq(filesTable.id, fid), eq(filesTable.userId, userId)));
      if (!owned) throw notFound("File not found");
      await db.insert(contactFilesTable).values({ contactId, fileId: fid });
      res.status(201).json({ success: true });
      return;
    }

    const file = (req as any).file;
    if (!file) throw badRequest("No file or fileId provided");

    const objectPath = await uploadToStorage(file);
    const [record] = await db.insert(filesTable).values({
      name: file.originalname, mimeType: file.mimetype, size: file.size, storageKey: objectPath, userId,
    }).returning();

    await db.insert(contactFilesTable).values({ contactId, fileId: record.id });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.delete("/contacts/:contactId/files/:fileId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const contactId = parseIntParam(req.params.contactId, "contactId");
    const fileId = parseIntParam(req.params.fileId, "fileId");
    if (!(await verifyContactOwnership(contactId, userId))) throw notFound();

    const result = await db.delete(contactFilesTable).where(and(
      eq(contactFilesTable.contactId, contactId),
      eq(contactFilesTable.fileId, fileId)
    )).returning();
    if (result.length === 0) throw notFound();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
