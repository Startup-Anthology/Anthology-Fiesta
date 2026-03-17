import { index, pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { leadsTable } from "./leads";
import { contactsTable } from "./contacts";

export const activitiesTable = pgTable("activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  direction: text("direction"),
  subject: text("subject"),
  body: text("body"),
  note: text("note"),
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  gmailLink: text("gmail_link"),
  notionPageId: text("notion_page_id"),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_activities_user_id").on(table.userId),
  index("idx_activities_lead_id").on(table.leadId),
  index("idx_activities_contact_id").on(table.contactId),
  index("idx_activities_gmail_thread").on(table.gmailThreadId),
]);

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
