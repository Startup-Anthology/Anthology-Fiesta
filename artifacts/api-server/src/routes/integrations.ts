import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, userIntegrationsTable, integrationTokensTable, oauthStatesTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { OAUTH_CONFIGS, buildAuthorizationUrl, exchangeCodeForTokens, upsertIntegration } from "../lib/integrations/oauth";

const router: IRouter = Router();
export const integrationsPublicRouter: IRouter = Router();

async function purgeExpiredOAuthStates(): Promise<void> {
  await db.delete(oauthStatesTable).where(lt(oauthStatesTable.expiresAt, new Date()));
}

async function storeOAuthState(state: string, userId: string, provider: string, expiresAt: Date): Promise<void> {
  await db.insert(oauthStatesTable).values({ state, userId, provider, expiresAt });
}

async function consumeOAuthState(state: string): Promise<{ userId: string; provider: string } | null> {
  const [pending] = await db
    .select({
      state: oauthStatesTable.state,
      userId: oauthStatesTable.userId,
      provider: oauthStatesTable.provider,
      expiresAt: oauthStatesTable.expiresAt,
    })
    .from(oauthStatesTable)
    .where(eq(oauthStatesTable.state, state))
    .limit(1);

  if (!pending || pending.expiresAt < new Date()) {
    if (pending) {
      await db.delete(oauthStatesTable).where(eq(oauthStatesTable.state, state));
    }
    return null;
  }

  await db.delete(oauthStatesTable).where(eq(oauthStatesTable.state, state));
  return { userId: pending.userId, provider: pending.provider };
}

function getRedirectBase(req: Request): string {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:8080";
  return `${proto}://${host}`;
}

router.get("/integrations", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(userIntegrationsTable)
    .where(eq(userIntegrationsTable.userId, userId));

  res.json(rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    category: r.category,
    status: r.status,
    displayName: r.displayName,
    connectedAt: r.createdAt,
  })));
});

router.get("/integrations/status", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(userIntegrationsTable)
    .where(eq(userIntegrationsTable.userId, userId));

  const statusMap: Record<string, string> = {};
  for (const r of rows) {
    statusMap[r.provider] = r.status;
  }
  res.json(statusMap);
});

router.post("/integrations/:provider/connect", requireAuth, async (req: Request, res: Response) => {
  const provider = req.params.provider as string;
  const userId = req.user!.id;
  const redirectBase = getRedirectBase(req);

  const configFn = OAUTH_CONFIGS[provider];
  if (!configFn) {
    res.status(400).json({ error: `Unknown provider: ${provider}` });
    return;
  }

  const config = configFn(redirectBase);
  if (!config) {
    res.status(400).json({ error: `Provider ${provider} is not configured (missing env vars)` });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  await purgeExpiredOAuthStates();
  await storeOAuthState(state, userId, provider, new Date(Date.now() + 10 * 60 * 1000));

  const authUrl = buildAuthorizationUrl(provider, config, state);
  res.json({ url: authUrl });
});

integrationsPublicRouter.get("/integrations/:provider/callback", async (req: Request, res: Response) => {
  const provider = req.params.provider as string;
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.status(400).json({ error: `OAuth error: ${error}` });
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: "Missing code or state" });
    return;
  }

  const pending = await consumeOAuthState(state);
  if (!pending || pending.provider !== provider) {
    res.status(400).json({ error: "Invalid or expired state" });
    return;
  }

  const { userId } = pending;
  const redirectBase = getRedirectBase(req);

  const config = OAUTH_CONFIGS[provider]?.(redirectBase);
  if (!config) {
    res.status(500).json({ error: "Provider config unavailable" });
    return;
  }

  try {
    const tokenData = await exchangeCodeForTokens(code, config);

    // Try to get display name from provider
    let displayName: string | null = null;
    try {
      if (provider === "gmail" || provider === "google_calendar") {
        const { google } = await import("googleapis");
        const oauth2Client = new (google.auth.OAuth2 as any)();
        oauth2Client.setCredentials({ access_token: tokenData.access_token });
        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        displayName = userInfo.data.email || null;
      } else if (provider === "outlook" || provider === "outlook_calendar") {
        const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (meRes.ok) {
          const me = await meRes.json() as { mail?: string; userPrincipalName?: string };
          displayName = me.mail || me.userPrincipalName || null;
        }
      } else if (provider === "slack") {
        const teamRes = await fetch("https://slack.com/api/team.info", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (teamRes.ok) {
          const teamData = await teamRes.json() as { ok?: boolean; team?: { name?: string } };
          displayName = teamData.team?.name || null;
        }
      }
    } catch {
      // display name is optional
    }

    await upsertIntegration(userId, provider, displayName, tokenData);

    // Redirect to mobile deep link or web settings
    const successRedirect = process.env.INTEGRATION_SUCCESS_REDIRECT || "/settings/integrations";
    res.redirect(successRedirect);
  } catch (err: any) {
    console.error(`Integration callback error for ${provider}:`, err.message);
    res.status(500).json({ error: "Failed to complete OAuth connection" });
  }
});

router.post("/integrations/notion/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { exportAllToNotion } = await import("../lib/notionExport");
    const result = await exportAllToNotion(req.user!.id);
    res.json(result);
  } catch (err: any) {
    console.error("Notion export error:", err.message);
    res.status(500).json({ error: err.message || "Export failed" });
  }
});

router.delete("/integrations/:provider", requireAuth, async (req: Request, res: Response) => {
  const provider = req.params.provider as string;
  const userId = req.user!.id;

  const [integration] = await db
    .select()
    .from(userIntegrationsTable)
    .where(
      and(
        eq(userIntegrationsTable.userId, userId),
        eq(userIntegrationsTable.provider, provider),
      )
    );

  if (!integration) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }

  // Delete tokens first (cascade would handle this, but be explicit)
  await db
    .delete(integrationTokensTable)
    .where(eq(integrationTokensTable.integrationId, integration.id));

  await db
    .delete(userIntegrationsTable)
    .where(
      and(
        eq(userIntegrationsTable.id, integration.id),
        eq(userIntegrationsTable.userId, userId),
      )
    );

  res.json({ success: true });
});

export default router;
