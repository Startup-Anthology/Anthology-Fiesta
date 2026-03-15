import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const aiInsightsTable = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("info"),
  sourceAgent: text("source_agent").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"),
  leadId: integer("lead_id"),
  contactId: integer("contact_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
}, (table) => [
  index("idx_ai_insights_user_id").on(table.userId),
  index("idx_ai_insights_status").on(table.status),
  index("idx_ai_insights_lead_id").on(table.leadId),
  index("idx_ai_insights_contact_id").on(table.contactId),
]);

export const insertAiInsightSchema = createInsertSchema(aiInsightsTable).omit({
  id: true,
  createdAt: true,
  dismissedAt: true,
});
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsightsTable.$inferSelect;
