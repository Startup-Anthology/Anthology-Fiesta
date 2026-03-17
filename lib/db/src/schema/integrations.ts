import { pgTable, serial, varchar, text, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userIntegrationsTable = pgTable("user_integrations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // 'email' | 'calendar' | 'notes'
  provider: text("provider").notNull(), // 'gmail' | 'outlook' | 'google_calendar' | 'outlook_calendar' | 'notion'
  status: text("status").notNull().default("active"), // 'active' | 'disconnected' | 'error'
  displayName: text("display_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("uq_user_provider").on(table.userId, table.provider),
  index("idx_integrations_user_id").on(table.userId),
]);

export const integrationTokensTable = pgTable("integration_tokens", {
  id: serial("id").primaryKey(),
  integrationId: serial("integration_id").notNull().references(() => userIntegrationsTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(), // AES-256-GCM encrypted
  refreshToken: text("refresh_token"), // AES-256-GCM encrypted
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  tokenType: text("token_type").default("Bearer"),
  scopes: text("scopes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_integration_tokens_integration_id").on(table.integrationId),
]);

export type UserIntegration = typeof userIntegrationsTable.$inferSelect;
export type IntegrationToken = typeof integrationTokensTable.$inferSelect;
