import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { contactsTable, calendarEventsTable } from "@workspace/db";
import { eq, sql, and, lte, isNotNull } from "drizzle-orm";
import { fireAndForgetContactSync } from "../lib/notionSync";
import { createCalendarEvent } from "../lib/calendar";
import { logAudit } from "../lib/audit";
import { parseIntParam } from "../lib/errors";
import { findOwned } from "../lib/crud";
import { validate, createContactSchema, updateContactSchema } from "../lib/validation";

const router = Router();

router.get("/contacts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { relationshipType, priority } = req.query;
    const conditions = [eq(contactsTable.userId, userId)];
    if (relationshipType) conditions.push(eq(contactsTable.relationshipType, relationshipType as string));
    if (priority) conditions.push(eq(contactsTable.priority, priority as string));

    const results = await db.select().from(contactsTable).where(and(...conditions)).orderBy(sql`${contactsTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get("/contacts/follow-ups", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await db.select().from(contactsTable)
      .where(and(eq(contactsTable.userId, req.user!.id), isNotNull(contactsTable.nextFollowUpAt), lte(contactsTable.nextFollowUpAt, new Date())))
      .orderBy(sql`${contactsTable.nextFollowUpAt} asc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/contacts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = validate(createContactSchema, req.body);
    const [contact] = await db.insert(contactsTable).values({ ...data, userId: req.user!.id }).returning();
    logAudit("contact", contact.id, "create", req.user!.id, null, contact as Record<string, unknown>);
    fireAndForgetContactSync(contact);
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

router.get("/contacts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntParam(req.params.id);
    const contact = await findOwned(contactsTable, id, req.user!.id);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.put("/contacts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const contactId = parseIntParam(req.params.id);
    const data = validate(updateContactSchema, req.body);
    const before = await findOwned(contactsTable, contactId, userId);
    const [contact] = await db.update(contactsTable).set({ ...data, updatedAt: new Date() }).where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, userId))).returning();
    logAudit("contact", contactId, "update", userId, before as Record<string, unknown>, contact as Record<string, unknown>);
    fireAndForgetContactSync(contact);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.delete("/contacts/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const contactId = parseIntParam(req.params.id);
    const before = await findOwned(contactsTable, contactId, userId);
    await db.delete(contactsTable).where(eq(contactsTable.id, contactId));
    logAudit("contact", contactId, "delete", userId, before as Record<string, unknown>, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/contacts/:id/mark-contacted", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const contactId = parseIntParam(req.params.id);
    const before = await findOwned(contactsTable, contactId, userId);
    const now = new Date();
    const followUp = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [contact] = await db.update(contactsTable)
      .set({ lastContactedAt: now, nextFollowUpAt: followUp, updatedAt: now })
      .where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, userId)))
      .returning();
    logAudit("contact", contactId, "update", userId, before as Record<string, unknown>, contact as Record<string, unknown>);

    if (req.body.addToCalendar !== false) {
      const followUpEnd = new Date(followUp.getTime() + 30 * 60000);
      let googleEventId: string | null = null;
      try {
        googleEventId = await createCalendarEvent({
          title: `Follow-up: ${contact.name}`,
          description: `Scheduled follow-up with ${contact.name}`,
          startTime: followUp.toISOString(),
          endTime: followUpEnd.toISOString(),
        });
      } catch (calErr: any) {
        console.error("Google Calendar sync failed for follow-up:", calErr.message);
      }
      const [calEvent] = await db.insert(calendarEventsTable).values({
        googleEventId,
        title: `Follow-up: ${contact.name}`,
        description: `Scheduled follow-up with ${contact.name}`,
        startTime: followUp,
        endTime: followUpEnd,
        contactId: contact.id,
        eventType: "follow-up",
        userId,
      }).returning();
      logAudit("calendar_event", calEvent.id, "create", userId, null, calEvent as Record<string, unknown>);
    }

    res.json(contact);
  } catch (err) {
    next(err);
  }
});

export default router;
