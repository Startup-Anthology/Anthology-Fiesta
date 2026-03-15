import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { leadsTable, contactsTable, activitiesTable, settingsTable } from "@workspace/db";
import { eq, gte, and, lte, count } from "drizzle-orm";

const router = Router();

router.get("/dashboard", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [totalLeadsResult] = await db
      .select({ count: count() })
      .from(leadsTable)
      .where(eq(leadsTable.userId, userId));

    const [leadsThisWeekResult] = await db
      .select({ count: count() })
      .from(leadsTable)
      .where(and(eq(leadsTable.userId, userId), gte(leadsTable.createdAt, weekAgo)));

    const [betaSlotsFilledResult] = await db
      .select({ count: count() })
      .from(leadsTable)
      .where(and(eq(leadsTable.userId, userId), eq(leadsTable.isBeta, true)));

    const [totalContactsResult] = await db
      .select({ count: count() })
      .from(contactsTable)
      .where(eq(contactsTable.userId, userId));

    const [followUpCountResult] = await db
      .select({ count: count() })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.userId, userId),
          lte(contactsTable.nextFollowUpAt, todayEnd)
        )
      );

    const followUps = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.userId, userId),
          lte(contactsTable.nextFollowUpAt, todayEnd)
        )
      )
      .orderBy(contactsTable.nextFollowUpAt)
      .limit(5);

    const [emailsSentResult] = await db
      .select({ count: count() })
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.userId, userId),
          eq(activitiesTable.type, "email"),
          eq(activitiesTable.direction, "sent"),
          gte(activitiesTable.createdAt, weekAgo)
        )
      );

    const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
    const settingsMap: Record<string, string> = {};
    for (const s of settingsRows) settingsMap[s.key] = s.value;
    const betaSlotsTotal = parseInt(settingsMap.beta_slots_total || "100", 10);

    res.json({
      totalLeads: Number(totalLeadsResult.count),
      leadsThisWeek: Number(leadsThisWeekResult.count),
      totalContacts: Number(totalContactsResult.count),
      emailsSentThisWeek: Number(emailsSentResult.count),
      followUpsDueToday: Number(followUpCountResult.count),
      betaSlotsFilled: Number(betaSlotsFilledResult.count),
      betaSlotsTotal: betaSlotsTotal,
      followUps,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
