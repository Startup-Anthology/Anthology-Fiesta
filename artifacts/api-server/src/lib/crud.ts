import { db } from "@workspace/db";
import { eq, and, type SQL } from "drizzle-orm";
import { notFound } from "./errors";

export async function findOwned(
  table: any,
  id: number,
  userId: string,
  extraConditions?: SQL[],
): Promise<Record<string, unknown>> {
  const conditions: SQL[] = [eq(table.id, id), eq(table.userId, userId)];
  if (extraConditions) conditions.push(...extraConditions);

  const [row] = await db.select().from(table).where(and(...conditions));
  if (!row) throw notFound();
  return row as Record<string, unknown>;
}
