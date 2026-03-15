import { index, pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  source: text("source").notNull().default("other"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  linkedinUrl: text("linkedin_url"),
  profilePictureUrl: text("profile_picture_url"),
  isBeta: boolean("is_beta").notNull().default(false),
  notionPageId: text("notion_page_id"),
  userId: varchar("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_leads_user_id").on(table.userId),
  index("idx_leads_email").on(table.email),
  index("idx_leads_status").on(table.status),
]);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
