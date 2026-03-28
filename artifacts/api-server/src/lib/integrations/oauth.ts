import { db, userIntegrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { storeTokens } from "./tokenManager";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export const OAUTH_CONFIGS: Record<string, (redirectBase: string) => OAuthConfig | null> = {
  gmail: (redirectBase) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
      redirectUri: `${redirectBase}/api/integrations/gmail/callback`,
    };
  },
  google_calendar: (redirectBase) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
      redirectUri: `${redirectBase}/api/integrations/google_calendar/callback`,
    };
  },
  outlook: (redirectBase) => {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["Mail.Send", "Mail.Read", "offline_access"],
      redirectUri: `${redirectBase}/api/integrations/outlook/callback`,
    };
  },
  outlook_calendar: (redirectBase) => {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["Calendars.ReadWrite", "offline_access"],
      redirectUri: `${redirectBase}/api/integrations/outlook_calendar/callback`,
    };
  },
  notion: (redirectBase) => {
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      redirectUri: `${redirectBase}/api/integrations/notion/callback`,
    };
  },
  slack: (redirectBase) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["chat:write", "chat:write.public", "channels:read", "groups:read"],
      redirectUri: `${redirectBase}/api/integrations/slack/callback`,
    };
  },
};

const PROVIDER_CATEGORY: Record<string, string> = {
  gmail: "email",
  outlook: "email",
  google_calendar: "calendar",
  outlook_calendar: "calendar",
  notion: "notes",
  slack: "messaging",
};

export function buildAuthorizationUrl(
  provider: string,
  config: OAuthConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${config.authorizationUrl}?${params}`;
}

export async function exchangeCodeForTokens(
  code: string,
  config: OAuthConfig,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  }>;
}

export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
}

export async function upsertIntegration(
  userId: string,
  provider: string,
  displayName: string | null,
  tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  },
): Promise<number> {
  const category = PROVIDER_CATEGORY[provider];
  if (!category) throw new Error(`Unknown provider: ${provider}`);

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  const [existing] = await db
    .select()
    .from(userIntegrationsTable)
    .where(
      and(
        eq(userIntegrationsTable.userId, userId),
        eq(userIntegrationsTable.provider, provider),
      )
    );

  let integrationId: number;
  if (existing) {
    await db
      .update(userIntegrationsTable)
      .set({ status: "active", displayName, updatedAt: new Date() })
      .where(eq(userIntegrationsTable.id, existing.id));
    integrationId = existing.id;
  } else {
    const [inserted] = await db
      .insert(userIntegrationsTable)
      .values({ userId, category, provider, status: "active", displayName })
      .returning();
    integrationId = inserted.id;
  }

  await storeTokens(integrationId, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: expiresAt ?? undefined,
    tokenType: tokenData.token_type,
    scopes: tokenData.scope,
  });

  return integrationId;
}
