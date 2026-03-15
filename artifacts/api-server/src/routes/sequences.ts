import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { dripSequencesTable, dripSequenceStepsTable, dripEnrollmentsTable, calendarEventsTable, leadsTable, contactsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { createCalendarEvent } from "../lib/calendar";
import { logAudit } from "../lib/audit";
import { parseIntParam, notFound } from "../lib/errors";
import { validate, createSequenceSchema, updateSequenceSchema, createStepSchema } from "../lib/validation";

const router = Router();

router.get("/sequences", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await db.select().from(dripSequencesTable).where(eq(dripSequencesTable.userId, req.user!.id)).orderBy(sql`${dripSequencesTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/sequences", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = validate(createSequenceSchema, req.body);
    const [sequence] = await db.insert(dripSequencesTable).values({ ...data, userId: req.user!.id }).returning();
    logAudit("sequence", sequence.id, "create", req.user!.id, null, sequence as Record<string, unknown>);
    res.status(201).json(sequence);
  } catch (err) {
    next(err);
  }
});

router.get("/sequences/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntParam(req.params.id);
    const [sequence] = await db.select().from(dripSequencesTable).where(and(eq(dripSequencesTable.id, id), eq(dripSequencesTable.userId, req.user!.id)));
    if (!sequence) throw notFound();

    const steps = await db.select().from(dripSequenceStepsTable).where(eq(dripSequenceStepsTable.sequenceId, id)).orderBy(sql`${dripSequenceStepsTable.stepOrder} asc`);
    const enrollments = await db.select().from(dripEnrollmentsTable).where(eq(dripEnrollmentsTable.sequenceId, id));

    res.json({ ...sequence, steps, enrollments });
  } catch (err) {
    next(err);
  }
});

router.put("/sequences/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const seqId = parseIntParam(req.params.id);
    const data = validate(updateSequenceSchema, req.body);

    const [before] = await db.select().from(dripSequencesTable).where(and(eq(dripSequencesTable.id, seqId), eq(dripSequencesTable.userId, userId)));
    if (!before) throw notFound();

    const [sequence] = await db.update(dripSequencesTable).set({ ...data, updatedAt: new Date() }).where(and(eq(dripSequencesTable.id, seqId), eq(dripSequencesTable.userId, userId))).returning();
    logAudit("sequence", seqId, "update", userId, before as Record<string, unknown>, sequence as Record<string, unknown>);
    res.json(sequence);
  } catch (err) {
    next(err);
  }
});

router.delete("/sequences/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id);
    const [before] = await db.select().from(dripSequencesTable).where(and(eq(dripSequencesTable.id, id), eq(dripSequencesTable.userId, userId)));
    if (!before) throw notFound();

    const steps = await db.select().from(dripSequenceStepsTable).where(eq(dripSequenceStepsTable.sequenceId, id));
    for (const step of steps) {
      logAudit("sequence_step", step.id, "delete", userId, step as Record<string, unknown>, null);
    }
    await db.delete(dripSequenceStepsTable).where(eq(dripSequenceStepsTable.sequenceId, id));
    await db.delete(dripEnrollmentsTable).where(eq(dripEnrollmentsTable.sequenceId, id));
    await db.delete(dripSequencesTable).where(eq(dripSequencesTable.id, id));
    logAudit("sequence", id, "delete", userId, before as Record<string, unknown>, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/sequences/:id/steps", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const seqId = parseIntParam(req.params.id);
    const [sequence] = await db.select().from(dripSequencesTable).where(and(eq(dripSequencesTable.id, seqId), eq(dripSequencesTable.userId, req.user!.id)));
    if (!sequence) throw notFound("Sequence not found");

    const data = validate(createStepSchema, req.body);
    const [step] = await db.insert(dripSequenceStepsTable).values({
      ...data,
      sequenceId: seqId,
    }).returning();
    logAudit("sequence_step", step.id, "create", req.user!.id, null, step as Record<string, unknown>);
    res.status(201).json(step);
  } catch (err) {
    next(err);
  }
});

router.post("/sequences/:id/enroll", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const seqId = parseIntParam(req.params.id);
    const [sequence] = await db.select().from(dripSequencesTable).where(and(eq(dripSequencesTable.id, seqId), eq(dripSequencesTable.userId, userId)));
    if (!sequence) throw notFound("Sequence not found");

    if (req.body.leadId) {
      const leadId = parseIntParam(String(req.body.leadId), "leadId");
      const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.userId, userId)));
      if (!lead) throw notFound("Lead not found");
    }
    if (req.body.contactId) {
      const contactId = parseIntParam(String(req.body.contactId), "contactId");
      const [contact] = await db.select().from(contactsTable).where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, userId)));
      if (!contact) throw notFound("Contact not found");
    }

    const [enrollment] = await db.insert(dripEnrollmentsTable).values({
      sequenceId: seqId,
      leadId: req.body.leadId || null,
      contactId: req.body.contactId || null,
      currentStep: 0,
      status: "active",
      nextSendAt: new Date(),
    }).returning();

    if (req.body.addToCalendar && sequence) {
      const now = new Date();
      const endTime = new Date(now.getTime() + 15 * 60000);
      let googleEventId: string | null = null;
      try {
        googleEventId = await createCalendarEvent({
          title: `Drip: ${sequence.name}`,
          description: `Enrolled in drip sequence "${sequence.name}"`,
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
        });
      } catch (calErr: any) {
        console.error("Google Calendar sync failed for enrollment:", calErr.message);
      }
      const [calEvent] = await db.insert(calendarEventsTable).values({
        googleEventId,
        title: `Drip: ${sequence.name}`,
        description: `Enrolled in drip sequence "${sequence.name}"`,
        startTime: now,
        endTime: endTime,
        leadId: req.body.leadId || null,
        contactId: req.body.contactId || null,
        eventType: "follow-up",
        userId,
      }).returning();
      logAudit("calendar_event", calEvent.id, "create", userId, null, calEvent as Record<string, unknown>);
    }

    res.status(201).json(enrollment);
  } catch (err) {
    next(err);
  }
});

export default router;
