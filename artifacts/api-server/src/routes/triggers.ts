import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { triggerRulesTable, dripSequencesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { parseIntParam, notFound } from "../lib/errors";
import { validate, createTriggerSchema } from "../lib/validation";

const router = Router();

router.get("/triggers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await db.select().from(triggerRulesTable).where(eq(triggerRulesTable.userId, req.user!.id)).orderBy(sql`${triggerRulesTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/triggers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const data = validate(createTriggerSchema, req.body);

    if (data.sequenceId) {
      const [seq] = await db.select().from(dripSequencesTable).where(and(eq(dripSequencesTable.id, data.sequenceId), eq(dripSequencesTable.userId, userId)));
      if (!seq) throw notFound("Sequence not found");
    }

    const [rule] = await db.insert(triggerRulesTable).values({ ...data, userId }).returning();
    logAudit("trigger", rule.id, "create", userId, null, rule as Record<string, unknown>);
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

router.delete("/triggers/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const triggerId = parseIntParam(req.params.id);
    const [before] = await db.select().from(triggerRulesTable).where(and(eq(triggerRulesTable.id, triggerId), eq(triggerRulesTable.userId, userId)));
    if (!before) throw notFound();

    await db.delete(triggerRulesTable).where(eq(triggerRulesTable.id, triggerId));
    logAudit("trigger", triggerId, "delete", userId, before as Record<string, unknown>, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
