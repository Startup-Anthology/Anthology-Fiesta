import { pool } from "./index";

const TABLES = [
  "leads", "contacts", "activities", "drip_sequences", "trigger_rules",
  "files", "email_templates", "broadcasts", "app_settings", "audit_log",
] as const;

async function main() {
  for (const table of TABLES) {
    const result = await pool.query(`DELETE FROM "${table}" WHERE user_id IS NULL`);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Cleaned ${result.rowCount} orphan row(s) from "${table}"`);
    }
  }
  console.log("Pre-deploy DB cleanup complete.");
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("Pre-deploy DB cleanup failed:", err);
  process.exit(1);
});
