import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    action: text("action").notNull(),
    userId: varchar("user_id").references(() => usersTable.id),
    beforeSnapshot: jsonb("before_snapshot"),
    afterSnapshot: jsonb("after_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_user").on(table.userId),
    index("idx_audit_created").on(table.createdAt),
  ]
);
