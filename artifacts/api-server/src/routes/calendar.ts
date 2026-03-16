import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { calendarEventsTable, leadsTable, contactsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, listCalendarEvents } from "../lib/calendar";
import { logAudit } from "../lib/audit";
import { parseIntParam, notFound, badRequest } from "../lib/errors";
import { validate, createCalendarEventSchema, updateCalendarEventSchema } from "../lib/validation";

const router = Router();

function isValidISODate(str: string): boolean {
  const d = new Date(str);
  return !isNaN(d.getTime());
}

router.get("/calendar/events", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, leadId, contactId } = req.query;
    const conditions = [eq(calendarEventsTable.userId, userId)];

    if (startDate) {
      if (!isValidISODate(startDate as string)) throw badRequest("Invalid startDate");
      conditions.push(gte(calendarEventsTable.startTime, new Date(startDate as string)));
    }
    if (endDate) {
      if (!isValidISODate(endDate as string)) throw badRequest("Invalid endDate");
      conditions.push(lte(calendarEventsTable.startTime, new Date(endDate as string)));
    }
    if (leadId) {
      conditions.push(eq(calendarEventsTable.leadId, parseIntParam(leadId as string, "leadId")));
    }
    if (contactId) {
      conditions.push(eq(calendarEventsTable.contactId, parseIntParam(contactId as string, "contactId")));
    }

    const rows = await db.select().from(calendarEventsTable).where(and(...conditions)).orderBy(sql`${calendarEventsTable.startTime} asc`);

    const leadIds = [...new Set(rows.filter((r) => r.leadId).map((r) => r.leadId!))];
    const contactIds = [...new Set(rows.filter((r) => r.contactId).map((r) => r.contactId!))];

    const leadNames: Record<number, string> = {};
    const contactNames: Record<number, string> = {};

    if (leadIds.length > 0) {
      const leads = await db.select({ id: leadsTable.id, name: leadsTable.name }).from(leadsTable).where(and(eq(leadsTable.userId, userId), inArray(leadsTable.id, leadIds)));
      for (const l of leads) leadNames[l.id] = l.name;
    }
    if (contactIds.length > 0) {
      const contacts = await db.select({ id: contactsTable.id, name: contactsTable.name }).from(contactsTable).where(and(eq(contactsTable.userId, userId), inArray(contactsTable.id, contactIds)));
      for (const c of contacts) contactNames[c.id] = c.name;
    }

    const results = rows.map((r) => ({
      ...r,
      leadName: r.leadId ? (leadNames[r.leadId] || null) : null,
      contactName: r.contactId ? (contactNames[r.contactId] || null) : null,
    }));

    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/calendar/events", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const data = validate(createCalendarEventSchema, req.body);

    if (!isValidISODate(data.startTime) || !isValidISODate(data.endTime)) {
      throw badRequest("startTime and endTime must be valid ISO date strings");
    }
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      throw badRequest("endTime must be after startTime");
    }

    if (data.leadId) {
      const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, data.leadId), eq(leadsTable.userId, userId)));
      if (!lead) throw notFound("Lead not found");
    }
    if (data.contactId) {
      const [contact] = await db.select().from(contactsTable).where(and(eq(contactsTable.id, data.contactId), eq(contactsTable.userId, userId)));
      if (!contact) throw notFound("Contact not found");
    }

    let googleEventId: string | null = null;
    try {
      googleEventId = await createCalendarEvent({
        title: data.title,
        description: data.description || undefined,
        startTime: data.startTime,
        endTime: data.endTime,
      });
    } catch (calErr: any) {
      console.error("Google Calendar sync failed, saving locally:", calErr.message);
    }

    const [event] = await db.insert(calendarEventsTable).values({
      googleEventId,
      title: data.title,
      description: data.description || null,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      leadId: data.leadId || null,
      contactId: data.contactId || null,
      eventType: data.eventType || "other",
      userId,
    }).returning();

    logAudit("calendar_event", event.id, "create", userId, null, event as Record<string, unknown>);
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

router.patch("/calendar/events/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id);
    const data = validate(updateCalendarEventSchema, req.body);

    const [existing] = await db.select().from(calendarEventsTable).where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId)));
    if (!existing) throw notFound("Event not found");

    if (data.startTime && !isValidISODate(data.startTime)) throw badRequest("Invalid startTime");
    if (data.endTime && !isValidISODate(data.endTime)) throw badRequest("Invalid endTime");

    const finalStart = data.startTime ? new Date(data.startTime) : existing.startTime;
    const finalEnd = data.endTime ? new Date(data.endTime) : existing.endTime;
    if (finalEnd <= finalStart) throw badRequest("endTime must be after startTime");

    const updatePayload: Record<string, any> = {};
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.startTime !== undefined) updatePayload.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updatePayload.endTime = new Date(data.endTime);
    if (data.eventType !== undefined) updatePayload.eventType = data.eventType;

    const [updated] = await db.update(calendarEventsTable).set(updatePayload).where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId))).returning();

    if (existing.googleEventId) {
      try {
        await updateCalendarEvent({
          googleEventId: existing.googleEventId,
          title: data.title,
          description: data.description ?? undefined,
          startTime: data.startTime,
          endTime: data.endTime,
        });
      } catch (calErr: any) {
        console.error("Google Calendar update failed, saved locally:", calErr.message);
      }
    }

    logAudit("calendar_event", id, "update", userId, existing as Record<string, unknown>, updated as Record<string, unknown>);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/calendar/events/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id);

    const [event] = await db.select().from(calendarEventsTable).where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId)));
    if (!event) throw notFound("Event not found");

    if (event.googleEventId) {
      try {
        await deleteCalendarEvent(event.googleEventId);
      } catch (calErr: any) {
        console.error("Google Calendar delete failed, removing locally:", calErr.message);
      }
    }

    await db.delete(calendarEventsTable).where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId)));
    logAudit("calendar_event", id, "delete", userId, event as Record<string, unknown>, null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/calendar/sync", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 30);

    let googleEvents: any[];
    try {
      googleEvents = await listCalendarEvents({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      });
    } catch (calErr: any) {
      console.error("Google Calendar sync fetch failed:", calErr.message);
      res.json({ synced: 0, error: "Could not reach Google Calendar" });
      return;
    }

    let synced = 0;

    for (const ge of googleEvents) {
      if (!ge.id) continue;

      const startRaw = ge.start?.dateTime || ge.start?.date;
      const endRaw = ge.end?.dateTime || ge.end?.date;
      if (!startRaw || !endRaw) continue;

      const title = ge.summary || "Untitled";
      const description = ge.description || null;
      const startTime = new Date(startRaw);
      const endTime = new Date(endRaw);

      const [existing] = await db
        .select()
        .from(calendarEventsTable)
        .where(
          and(
            eq(calendarEventsTable.googleEventId, ge.id),
            eq(calendarEventsTable.userId, userId)
          )
        );

      if (existing) {
        await db
          .update(calendarEventsTable)
          .set({ title, description, startTime, endTime })
          .where(eq(calendarEventsTable.id, existing.id));
      } else {
        await db.insert(calendarEventsTable).values({
          googleEventId: ge.id,
          title,
          description,
          startTime,
          endTime,
          eventType: "other",
          userId,
        });
      }
      synced++;
    }

    res.json({ synced });
  } catch (err) {
    next(err);
  }
});

export default router;
