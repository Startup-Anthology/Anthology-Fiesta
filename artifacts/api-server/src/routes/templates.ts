import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { emailTemplatesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { parseIntParam, notFound } from "../lib/errors";
import { validate, createTemplateSchema, updateTemplateSchema } from "../lib/validation";

const router = Router();

router.get("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { audience } = req.query;
    const conditions = [eq(emailTemplatesTable.userId, userId)];
    if (audience) conditions.push(eq(emailTemplatesTable.audience, audience as string));

    const results = await db.select().from(emailTemplatesTable).where(and(...conditions)).orderBy(sql`${emailTemplatesTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = validate(createTemplateSchema, req.body);
    const [template] = await db.insert(emailTemplatesTable).values({ ...data, userId: req.user!.id }).returning();
    logAudit("template", template.id, "create", req.user!.id, null, template as Record<string, unknown>);
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

router.get("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntParam(req.params.id);
    const [template] = await db.select().from(emailTemplatesTable).where(and(eq(emailTemplatesTable.id, id), eq(emailTemplatesTable.userId, req.user!.id)));
    if (!template) throw notFound();
    res.json(template);
  } catch (err) {
    next(err);
  }
});

router.put("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const templateId = parseIntParam(req.params.id);
    const data = validate(updateTemplateSchema, req.body);

    const [before] = await db.select().from(emailTemplatesTable).where(and(eq(emailTemplatesTable.id, templateId), eq(emailTemplatesTable.userId, userId)));
    if (!before) throw notFound();

    const [template] = await db.update(emailTemplatesTable).set({ ...data, updatedAt: new Date() }).where(and(eq(emailTemplatesTable.id, templateId), eq(emailTemplatesTable.userId, userId))).returning();
    logAudit("template", templateId, "update", userId, before as Record<string, unknown>, template as Record<string, unknown>);
    res.json(template);
  } catch (err) {
    next(err);
  }
});

router.delete("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const templateId = parseIntParam(req.params.id);
    const [before] = await db.select().from(emailTemplatesTable).where(and(eq(emailTemplatesTable.id, templateId), eq(emailTemplatesTable.userId, userId)));
    if (!before) throw notFound();

    await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, templateId));
    logAudit("template", templateId, "delete", userId, before as Record<string, unknown>, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
