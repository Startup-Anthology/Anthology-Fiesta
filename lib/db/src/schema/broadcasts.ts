import { index, pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  templateId: integer("template_id"),
  segmentType: text("segment_type").notNull(),
  segmentValue: text("segment_value").notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  status: text("status").notNull().default("draft"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  userId: varchar("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_broadcasts_user_id").on(table.userId),
]);

export const insertBroadcastSchema = createInsertSchema(broadcastsTable).omit({ id: true, createdAt: true });
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcastsTable.$inferSelect;
