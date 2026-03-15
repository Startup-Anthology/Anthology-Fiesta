import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { leadsTable, triggerRulesTable, dripEnrollmentsTable, activitiesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { fireAndForgetLeadSync, fireAndForgetActivitySync } from "../lib/notionSync";
import { logAudit } from "../lib/audit";
import { parseIntParam } from "../lib/errors";
import { findOwned } from "../lib/crud";
import { validate, createLeadSchema, updateLeadSchema, updateStatusSchema } from "../lib/validation";

const router = Router();

router.get("/leads", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { status, isBeta } = req.query;
    const conditions = [eq(leadsTable.userId, userId)];
    if (status) conditions.push(eq(leadsTable.status, status as string));
    if (isBeta === "true") conditions.push(eq(leadsTable.isBeta, true));
    if (isBeta === "false") conditions.push(eq(leadsTable.isBeta, false));

    const results = await db.select().from(leadsTable).where(and(...conditions)).orderBy(sql`${leadsTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/leads", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = validate(createLeadSchema, req.body);
    const [lead] = await db.insert(leadsTable).values({ ...data, userId: req.user!.id }).returning();
    logAudit("lead", lead.id, "create", req.user!.id, null, lead as Record<string, unknown>);
    fireAndForgetLeadSync(lead);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

router.get("/leads/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntParam(req.params.id);
    const lead = await findOwned(leadsTable, id, req.user!.id);
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.put("/leads/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.id);
    const data = validate(updateLeadSchema, req.body);
    const before = await findOwned(leadsTable, leadId, userId);
    const [lead] = await db.update(leadsTable).set({ ...data, updatedAt: new Date() }).where(and(eq(leadsTable.id, leadId), eq(leadsTable.userId, userId))).returning();
    logAudit("lead", leadId, "update", userId, before as Record<string, unknown>, lead as Record<string, unknown>);
    fireAndForgetLeadSync(lead);
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.delete("/leads/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.id);
    const before = await findOwned(leadsTable, leadId, userId);
    await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    logAudit("lead", leadId, "delete", userId, before as Record<string, unknown>, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.patch("/leads/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.id);
    const { status } = validate(updateStatusSchema, req.body);
    const before = await findOwned(leadsTable, leadId, userId);
    const [lead] = await db.update(leadsTable).set({ status, updatedAt: new Date() }).where(and(eq(leadsTable.id, leadId), eq(leadsTable.userId, userId))).returning();
    logAudit("lead", leadId, "update", userId, before as Record<string, unknown>, lead as Record<string, unknown>);

    const oldStatus = (before.status as string) || "unknown";
    const [activity] = await db.insert(activitiesTable).values({
      leadId,
      type: "status_change",
      note: `Status changed from ${oldStatus} to ${status}`,
      userId,
    }).returning();
    fireAndForgetActivitySync(activity);

    fireAndForgetLeadSync(lead);

    const triggers = await db.select().from(triggerRulesTable).where(and(eq(triggerRulesTable.triggerStatus, status), eq(triggerRulesTable.userId, userId)));
    for (const trigger of triggers) {
      if (trigger.actionType === "enroll_sequence" && trigger.sequenceId) {
        await db.insert(dripEnrollmentsTable).values({
          sequenceId: trigger.sequenceId,
          leadId: lead.id,
          currentStep: 0,
          status: "active",
          nextSendAt: new Date(),
        });
      }
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

export default router;
