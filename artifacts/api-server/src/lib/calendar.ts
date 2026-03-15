import { google } from "googleapis";

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-calendar",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  ).then((res) => res.json()).then((data: any) => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Google Calendar not connected");
  }
  return accessToken;
}

async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function createCalendarEvent(params: {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
}): Promise<string | null> {
  const calendar = await getUncachableGoogleCalendarClient();
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: params.title,
      description: params.description || "",
      start: { dateTime: params.startTime, timeZone: "UTC" },
      end: { dateTime: params.endTime, timeZone: "UTC" },
    },
  });
  return event.data.id || null;
}

export async function updateCalendarEvent(params: {
  googleEventId: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
}): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  const requestBody: Record<string, unknown> = {};
  if (params.title !== undefined) requestBody.summary = params.title;
  if (params.description !== undefined) requestBody.description = params.description;
  if (params.startTime !== undefined) requestBody.start = { dateTime: params.startTime, timeZone: "UTC" };
  if (params.endTime !== undefined) requestBody.end = { dateTime: params.endTime, timeZone: "UTC" };
  await calendar.events.patch({
    calendarId: "primary",
    eventId: params.googleEventId,
    requestBody,
  });
}

export async function deleteCalendarEvent(googleEventId: string): Promise<void> {
  const calendar = await getUncachableGoogleCalendarClient();
  await calendar.events.delete({
    calendarId: "primary",
    eventId: googleEventId,
  });
}

export async function listCalendarEvents(params: {
  timeMin: string;
  timeMax: string;
}): Promise<any[]> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });
    return response.data.items || [];
  } catch (err: any) {
    console.error("Failed to list Google Calendar events:", err.message);
    return [];
  }
}
