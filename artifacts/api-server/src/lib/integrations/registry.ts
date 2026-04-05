import type { EmailProvider, CalendarProvider, NotesProvider, MessagingProvider } from "./types";
import { getIntegration, getTokens, isTokenExpiringSoon, markIntegrationError, markIntegrationSuccess } from "./tokenManager";
import { OAUTH_CONFIGS, refreshAccessToken } from "./oauth";
import { storeTokens } from "./tokenManager";

function getRedirectBase(): string {
  return process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
}

const inFlightRefreshes = new Map<string, Promise<string | null>>();

async function getFreshTokens(userId: string, provider: string): Promise<string | null> {
  const integration = await getIntegration(userId, provider);
  if (!integration) return null;

  const tokens = await getTokens(integration.id);
  if (!tokens) return null;

  if (isTokenExpiringSoon(tokens.expiresAt) && tokens.refreshToken) {
    const refreshKey = `${userId}:${provider}`;
    const refreshToken = tokens.refreshToken;
    const existingRefresh = inFlightRefreshes.get(refreshKey);
    if (existingRefresh) {
      return existingRefresh;
    }

    const refreshPromise = (async () => {
    try {
      const config = OAUTH_CONFIGS[provider]?.(getRedirectBase());
      if (!config) return tokens.accessToken;
      const refreshed = await refreshAccessToken(config, refreshToken);
      await storeTokens(integration.id, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
        expiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : tokens.expiresAt,
        tokenType: tokens.tokenType,
        scopes: tokens.scopes,
      });
      await markIntegrationSuccess(integration.id);
      return refreshed.access_token;
    } catch (err) {
      console.error(`Token refresh failed for ${provider}:`, err);
      await markIntegrationError(integration.id);
      return null;
    } finally {
      inFlightRefreshes.delete(refreshKey);
    }
    })();
    inFlightRefreshes.set(refreshKey, refreshPromise);
    return refreshPromise;
  }

  return tokens.accessToken;
}

export async function getEmailProvider(userId: string): Promise<EmailProvider | null> {
  // Try Gmail first, then Outlook
  const gmailToken = await getFreshTokens(userId, "gmail");
  if (gmailToken) {
    const { GmailProvider } = await import("./email/gmail");
    return new GmailProvider(gmailToken);
  }

  const outlookToken = await getFreshTokens(userId, "outlook");
  if (outlookToken) {
    const { OutlookEmailProvider } = await import("./email/outlook");
    return new OutlookEmailProvider(outlookToken);
  }

  return null;
}

export async function getCalendarProvider(userId: string): Promise<CalendarProvider | null> {
  // Try Google Calendar first, then Outlook Calendar
  const googleToken = await getFreshTokens(userId, "google_calendar");
  if (googleToken) {
    const { GoogleCalendarProvider } = await import("./calendar/google");
    return new GoogleCalendarProvider(googleToken);
  }

  const outlookToken = await getFreshTokens(userId, "outlook_calendar");
  if (outlookToken) {
    const { OutlookCalendarProvider } = await import("./calendar/outlook");
    return new OutlookCalendarProvider(outlookToken);
  }

  return null;
}

export async function getNotesProvider(userId: string): Promise<NotesProvider | null> {
  const notionToken = await getFreshTokens(userId, "notion");
  if (notionToken) {
    const { NotionProvider } = await import("./notes/notion");
    return new NotionProvider(notionToken);
  }

  return null;
}

export async function getMessagingProvider(userId: string): Promise<MessagingProvider | null> {
  const slackToken = await getFreshTokens(userId, "slack");
  if (slackToken) {
    const { SlackProvider } = await import("./messaging/slack");
    return new SlackProvider(slackToken);
  }

  return null;
}
