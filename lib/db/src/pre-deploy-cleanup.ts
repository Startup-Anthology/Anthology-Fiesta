import { db } from "./index";
import { sql } from "drizzle-orm";

const TABLES = [
  "leads", "contacts", "activities", "drip_sequences", "trigger_rules",
  "files", "email_templates", "broadcasts", "app_settings", "audit_log",
];

async function main() {
  for (const table of TABLES) {
    const rows = await db.execute<{ id: unknown }>(sql.raw(`DELETE FROM "${table}" WHERE user_id IS NULL RETURNING id`));
    if (rows.length > 0) console.log(`Cleaned ${rows.length} orphan row(s) from "${table}"`);
  }
  console.log("Pre-deploy DB cleanup complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-deploy DB cleanup failed:", err);
  process.exit(1);
});
