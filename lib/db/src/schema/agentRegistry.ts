import { boolean, pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentRegistryTable = pgTable("agent_registry", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  personality: text("personality").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  toolSchemas: jsonb("tool_schemas").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAgentRegistrySchema = createInsertSchema(agentRegistryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AgentRegistry = typeof agentRegistryTable.$inferSelect;
export type InsertAgentRegistry = z.infer<typeof insertAgentRegistrySchema>;
