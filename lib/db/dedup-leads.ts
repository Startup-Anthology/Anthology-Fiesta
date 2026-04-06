/**
 * Dedup leads by (email, userId) — must be run BEFORE db push adds the unique index.
 *
 * Pass --execute to actually make changes (dry-run by default).
 *
 * Run: pnpm --filter db exec tsx --env-file=../../.env dedup-leads.ts
 */
import { db } from "./src/index.js";
import { sql } from "drizzle-orm";

const isDryRun = !process.argv.includes("--execute");

if (isDryRun) {
  console.log("DRY RUN — pass --execute to commit changes\n");
} else {
  console.log("EXECUTE MODE — changes will be committed\n");
}

// Step 1: Find duplicates
const dupsResult = await db.execute(sql`
  SELECT email, user_id, COUNT(*) as cnt, array_agg(id ORDER BY updated_at DESC) as ids
  FROM leads
  GROUP BY email, user_id
  HAVING COUNT(*) > 1
`);

const rows = dupsResult.rows as { email: string; user_id: string; cnt: string; ids: number[] }[];

if (rows.length === 0) {
  console.log("No duplicate leads found. Safe to run db push.");
  process.exit(0);
}

console.log(`Found ${rows.length} duplicate group(s):\n`);
for (const row of rows) {
  const [winner, ...losers] = row.ids;
  console.log(`  email=${row.email} userId=${row.user_id} — keep id=${winner}, remove ids=${losers.join(",")}`);
}

if (isDryRun) {
  console.log("\nDry run complete. Run with --execute to apply.");
  process.exit(0);
}

// Step 2: Execute
for (const row of rows) {
  const [winner, ...losers] = row.ids;
  if (losers.length === 0) continue;

  // Re-point child records to winner before deleting losers
  await db.execute(sql`UPDATE activities SET lead_id = ${winner} WHERE lead_id = ANY(ARRAY[${sql.raw(losers.join(","))}]::int[])`);
  await db.execute(sql`UPDATE calendar_events SET lead_id = ${winner} WHERE lead_id = ANY(ARRAY[${sql.raw(losers.join(","))}]::int[])`);
  await db.execute(sql`UPDATE drip_enrollments SET lead_id = ${winner} WHERE lead_id = ANY(ARRAY[${sql.raw(losers.join(","))}]::int[])`);
  await db.execute(sql`UPDATE ai_insights SET lead_id = ${winner} WHERE lead_id = ANY(ARRAY[${sql.raw(losers.join(","))}]::int[])`);
  await db.execute(sql`UPDATE lead_files SET lead_id = ${winner} WHERE lead_id = ANY(ARRAY[${sql.raw(losers.join(","))}]::int[])`);

  // Delete loser rows
  await db.execute(sql`DELETE FROM leads WHERE id = ANY(ARRAY[${sql.raw(losers.join(","))}]::int[])`);
  console.log(`  Merged losers [${losers.join(",")}] into winner ${winner}`);
}

console.log("\nDedup complete. Now run: pnpm --filter db push");
process.exit(0);
