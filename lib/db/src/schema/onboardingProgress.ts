import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const onboardingProgressTable = pgTable("onboarding_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  topic: text("topic").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_onboarding_user_id").on(table.userId),
]);

export type OnboardingProgress = typeof onboardingProgressTable.$inferSelect;
