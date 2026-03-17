import { google } from "googleapis";
import type { CalendarProvider, CalendarEvent } from "../types";

export class GoogleCalendarProvider implements CalendarProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private getClient() {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: this.accessToken });
    return google.calendar({ version: "v3", auth: oauth2Client });
  }

  async createEvent(params: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
  }): Promise<string | null> {
    const calendar = this.getClient();
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

  async updateEvent(
    eventId: string,
    params: { title?: string; description?: string; startTime?: string; endTime?: string },
  ): Promise<void> {
    const calendar = this.getClient();
    const requestBody: Record<string, unknown> = {};
    if (params.title !== undefined) requestBody.summary = params.title;
    if (params.description !== undefined) requestBody.description = params.description;
    if (params.startTime !== undefined) requestBody.start = { dateTime: params.startTime, timeZone: "UTC" };
    if (params.endTime !== undefined) requestBody.end = { dateTime: params.endTime, timeZone: "UTC" };
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody,
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    const calendar = this.getClient();
    await calendar.events.delete({ calendarId: "primary", eventId });
  }

  async listEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    try {
      const calendar = this.getClient();
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });
      return (response.data.items || []).map((e) => ({
        id: e.id || "",
        title: e.summary || "",
        description: e.description || undefined,
        startTime: e.start?.dateTime || e.start?.date || "",
        endTime: e.end?.dateTime || e.end?.date || "",
      }));
    } catch (err: any) {
      console.error("Failed to list Google Calendar events:", err.message);
      return [];
    }
  }
}
