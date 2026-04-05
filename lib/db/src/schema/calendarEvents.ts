import { index, uniqueIndex, pgTable, pgEnum, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { leadsTable } from "./leads";
import { contactsTable } from "./contacts";

export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "follow-up",
  "meeting",
  "call",
  "reminder",
  "email",
  "other",
]);

export const calendarEventsTable = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  googleEventId: text("google_event_id"),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  eventType: calendarEventTypeEnum("event_type").notNull().default("other"),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_calendar_events_user_id").on(table.userId),
  index("idx_calendar_events_lead_id").on(table.leadId),
  index("idx_calendar_events_contact_id").on(table.contactId),
  index("idx_calendar_events_start_time").on(table.startTime),
  uniqueIndex("idx_calendar_events_user_google").on(table.userId, table.googleEventId),
]);

export const insertCalendarEventSchema = createInsertSchema(calendarEventsTable).omit({ id: true, createdAt: true });
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEventsTable.$inferSelect;
