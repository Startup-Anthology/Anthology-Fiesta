import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router = Router();

const VALID_SETTING_KEYS = new Set([
  "beta_slots_total",
  "app_name",
  "founder_name",
  "notion_leads_db",
  "notion_contacts_db",
  "notion_activities_db",
  "quick_link_my_linkedin",
  "quick_link_company_linkedin",
  "quick_link_calendar",
  "quick_link_custom1_label",
  "quick_link_custom1_url",
  "quick_link_custom2_label",
  "quick_link_custom2_url",
  "quick_link_custom3_label",
  "quick_link_custom3_url",
]);

router.get("/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const results = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
    const settings: Record<string, string> = {};
    for (const r of results) {
      settings[r.key] = r.value;
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.put("/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const entries = Object.entries(req.body) as [string, string][];
    for (const [key, value] of entries) {
      if (typeof key !== "string" || typeof value !== "string") continue;
      if (!VALID_SETTING_KEYS.has(key)) continue;
      const existing = await db.select().from(settingsTable).where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
      if (existing.length > 0) {
        const before = { key, value: existing[0].value };
        await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
        logAudit("setting", existing[0].id, "update", userId, before as Record<string, unknown>, { key, value } as Record<string, unknown>);
      } else {
        const [inserted] = await db.insert(settingsTable).values({ key, value, userId }).returning();
        logAudit("setting", inserted.id, "create", userId, null, { key, value } as Record<string, unknown>);
      }
    }
    const results = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
    const settings: Record<string, string> = {};
    for (const r of results) {
      settings[r.key] = r.value;
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

export default router;
