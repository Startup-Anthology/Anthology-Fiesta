import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const oauthStatesTable = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_oauth_states_expires_at").on(table.expiresAt),
  index("idx_oauth_states_user_provider").on(table.userId, table.provider),
]);

