import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { activitiesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { fireAndForgetActivitySync } from "../lib/notionSync";
import { parseIntParam, notFound } from "../lib/errors";
import { validate, createActivitySchema, updateActivitySchema } from "../lib/validation";

const router = Router();

router.get("/activities", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { leadId, contactId } = req.query;
    const conditions = [eq(activitiesTable.userId, userId)];
    if (leadId) conditions.push(eq(activitiesTable.leadId, parseIntParam(leadId as string, "leadId")));
    if (contactId) conditions.push(eq(activitiesTable.contactId, parseIntParam(contactId as string, "contactId")));

    const results = await db.select().from(activitiesTable).where(and(...conditions)).orderBy(sql`${activitiesTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/activities", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = validate(createActivitySchema, req.body);
    const [activity] = await db.insert(activitiesTable).values({ ...data, userId: req.user!.id }).returning();
    fireAndForgetActivitySync(activity);
    res.status(201).json(activity);
  } catch (err) {
    next(err);
  }
});

router.patch("/activities/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id);
    const data = validate(updateActivitySchema, req.body);

    const [existing] = await db.select().from(activitiesTable).where(and(eq(activitiesTable.id, id), eq(activitiesTable.userId, userId)));
    if (!existing) throw notFound("Activity not found");

    const [updated] = await db.update(activitiesTable).set(data).where(eq(activitiesTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
