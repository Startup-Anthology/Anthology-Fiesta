import { index, pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const triggerRulesTable = pgTable("trigger_rules", {
  id: serial("id").primaryKey(),
  triggerStatus: text("trigger_status").notNull(),
  actionType: text("action_type").notNull(),
  sequenceId: integer("sequence_id"),
  followUpDays: integer("follow_up_days"),
  userId: varchar("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_trigger_rules_user_id").on(table.userId),
]);

export const insertTriggerRuleSchema = createInsertSchema(triggerRulesTable).omit({ id: true, createdAt: true });
export type InsertTriggerRule = z.infer<typeof insertTriggerRuleSchema>;
export type TriggerRule = typeof triggerRulesTable.$inferSelect;
