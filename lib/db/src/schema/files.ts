import { index, pgTable, serial, integer, text, timestamp, varchar, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { leadsTable } from "./leads";
import { contactsTable } from "./contacts";

export const filesTable = pgTable("files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  userId: varchar("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_files_user_id").on(table.userId),
]);

export const leadFilesTable = pgTable("lead_files", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  fileId: integer("file_id").notNull().references(() => filesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_lead_files_lead_id").on(table.leadId),
  index("idx_lead_files_file_id").on(table.fileId),
  unique("uq_lead_file").on(table.leadId, table.fileId),
]);

export const contactFilesTable = pgTable("contact_files", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  fileId: integer("file_id").notNull().references(() => filesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_contact_files_contact_id").on(table.contactId),
  index("idx_contact_files_file_id").on(table.fileId),
  unique("uq_contact_file").on(table.contactId, table.fileId),
]);

export const insertFileSchema = createInsertSchema(filesTable).omit({ id: true, createdAt: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type FileRecord = typeof filesTable.$inferSelect;
