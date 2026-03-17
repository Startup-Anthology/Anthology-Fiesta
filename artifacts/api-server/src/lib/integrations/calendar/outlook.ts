import type { CalendarProvider, CalendarEvent } from "../types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class OutlookCalendarProvider implements CalendarProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async graphRequest(path: string, method: string, body?: unknown): Promise<any> {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Graph API error ${res.status}: ${text}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async createEvent(params: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
  }): Promise<string | null> {
    const data = await this.graphRequest("/me/events", "POST", {
      subject: params.title,
      body: { contentType: "Text", content: params.description || "" },
      start: { dateTime: params.startTime, timeZone: "UTC" },
      end: { dateTime: params.endTime, timeZone: "UTC" },
    });
    return data?.id || null;
  }

  async updateEvent(
    eventId: string,
    params: { title?: string; description?: string; startTime?: string; endTime?: string },
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.title !== undefined) body.subject = params.title;
    if (params.description !== undefined) body.body = { contentType: "Text", content: params.description };
    if (params.startTime !== undefined) body.start = { dateTime: params.startTime, timeZone: "UTC" };
    if (params.endTime !== undefined) body.end = { dateTime: params.endTime, timeZone: "UTC" };
    await this.graphRequest(`/me/events/${eventId}`, "PATCH", body);
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.graphRequest(`/me/events/${eventId}`, "DELETE");
  }

  async listEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    try {
      const data = await this.graphRequest(
        `/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$orderby=start/dateTime&$top=250`,
        "GET",
      );
      return (data?.value || []).map((e: any) => ({
        id: e.id || "",
        title: e.subject || "",
        description: e.body?.content || undefined,
        startTime: e.start?.dateTime || "",
        endTime: e.end?.dateTime || "",
      }));
    } catch (err: any) {
      console.error("Failed to list Outlook Calendar events:", err.message);
      return [];
    }
  }
}
