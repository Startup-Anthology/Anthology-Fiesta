import { db } from "./index";
import { sql } from "drizzle-orm";

const TABLES = [
  "leads", "contacts", "activities", "drip_sequences", "trigger_rules",
  "files", "email_templates", "broadcasts", "app_settings", "audit_log",
];

async function main() {
  for (const table of TABLES) {
    const result = await db.execute(sql.raw(`DELETE FROM "${table}" WHERE user_id IS NULL`));
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`Cleaned ${count} orphan row(s) from "${table}"`);
  }
  console.log("Pre-deploy DB cleanup complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-deploy DB cleanup failed:", err);
  process.exit(1);
});
