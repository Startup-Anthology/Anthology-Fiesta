import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { verifyModelAvailability } from "../lib/ai/orchestrator";

const router = Router();

const startTime = Date.now();

router.get("/admin/diagnostics", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checks: Record<string, any> = {};

    const dbStart = Date.now();
    try {
      const result = await db.execute(sql`SELECT NOW() as now, current_database() as db`);
      const rows = (result as any).rows ?? result;
      const row = Array.isArray(rows) ? rows[0] : rows;
      checks.database = {
        status: "connected",
        latencyMs: Date.now() - dbStart,
        database: row?.db,
        serverTime: row?.now,
      };
    } catch (err: any) {
      checks.database = { status: "error", error: err.message, latencyMs: Date.now() - dbStart };
    }

    try {
      const result = await db.execute(sql`
        SELECT tablename, 
               (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as row_estimate
        FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY tablename
      `);
      const tableRows = (result as any).rows ?? result;
      const arr = Array.isArray(tableRows) ? tableRows : [];
      checks.tables = arr.map((t: any) => ({
        name: t.tablename,
        rowEstimate: Number(t.row_estimate) || 0,
      }));
    } catch (err: any) {
      checks.tables = { status: "error", error: err.message };
    }

    const aiStart = Date.now();
    try {
      const available = await verifyModelAvailability();
      checks.ai = {
        status: available ? "available" : "unavailable",
        latencyMs: Date.now() - aiStart,
      };
    } catch (err: any) {
      checks.ai = { status: "error", error: err.message, latencyMs: Date.now() - aiStart };
    }

    const horizonBaseUrl = process.env.HORIZON_BASE_URL;
    const crmApiKey = process.env.CRM_API_KEY;
    if (horizonBaseUrl && crmApiKey) {
      const hStart = Date.now();
      try {
        const hRes = await fetch(`${horizonBaseUrl.replace(/\/+$/, "")}/api/crm/users`, {
          headers: { "X-CRM-API-KEY": crmApiKey },
          signal: AbortSignal.timeout(5000),
        });
        checks.horizon = {
          status: hRes.ok ? "connected" : `error (${hRes.status})`,
          latencyMs: Date.now() - hStart,
          baseUrl: horizonBaseUrl,
        };
      } catch (err: any) {
        checks.horizon = { status: "error", error: err.message, latencyMs: Date.now() - hStart, baseUrl: horizonBaseUrl };
      }
    } else {
      checks.horizon = {
        status: "not configured",
        missingVars: [
          ...(!horizonBaseUrl ? ["HORIZON_BASE_URL"] : []),
          ...(!crmApiKey ? ["CRM_API_KEY"] : []),
        ],
      };
    }

    checks.environment = {
      nodeEnv: process.env.NODE_ENV || "unknown",
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };

    checks.integrations = {
      gmail: !!process.env.AI_INTEGRATION_GOOGLE_MAIL_CREDENTIALS ? "configured" : "not configured",
      googleCalendar: !!process.env.AI_INTEGRATION_GOOGLE_CALENDAR_CREDENTIALS ? "configured" : "not configured",
      notion: !!process.env.AI_INTEGRATION_NOTION_CREDENTIALS ? "configured" : "not configured",
    };

    res.json(checks);
  } catch (err) {
    next(err);
  }
});

router.get("/admin/recent-errors", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));

    const auditResult = await db.execute(sql`
      SELECT entity_type, action, entity_id, created_at, user_id
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    const recentAudits = (auditResult as any).rows ?? auditResult;

    const convResult = await db.execute(sql`
      SELECT c.id, c.title, c.agents_involved, c.created_at, c.updated_at,
             u.email as user_email,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.updated_at DESC
      LIMIT 10
    `);
    const recentConversations = (convResult as any).rows ?? convResult;

    const activityResult = await db.execute(sql`
      SELECT entity_type, action, COUNT(*) as count, MAX(created_at) as last_at
      FROM audit_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY entity_type, action
      ORDER BY count DESC
    `);
    const syncActivity = (activityResult as any).rows ?? activityResult;

    res.json({
      recentAuditLog: Array.isArray(recentAudits) ? recentAudits : [],
      recentConversations: Array.isArray(recentConversations) ? recentConversations : [],
      last24hActivity: Array.isArray(syncActivity) ? syncActivity : [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
