// Legacy shim — delegates to the per-user integration system.
// New code should use: import { getCalendarProvider } from "./integrations/registry"

import { getCalendarProvider } from "./integrations/registry";

export async function createCalendarEvent(
  params: { title: string; description?: string; startTime: string; endTime: string },
  userId?: string,
): Promise<string | null> {
  if (!userId) throw new Error("userId required");
  const provider = await getCalendarProvider(userId);
  if (!provider) return null;
  return provider.createEvent(params);
}

export async function updateCalendarEvent(
  params: { googleEventId: string; title?: string; description?: string; startTime?: string; endTime?: string },
  userId?: string,
): Promise<void> {
  if (!userId) throw new Error("userId required");
  const provider = await getCalendarProvider(userId);
  if (!provider) return;
  await provider.updateEvent(params.googleEventId, {
    title: params.title,
    description: params.description,
    startTime: params.startTime,
    endTime: params.endTime,
  });
}

export async function deleteCalendarEvent(googleEventId: string, userId?: string): Promise<void> {
  if (!userId) throw new Error("userId required");
  const provider = await getCalendarProvider(userId);
  if (!provider) return;
  await provider.deleteEvent(googleEventId);
}

export async function listCalendarEvents(
  params: { timeMin: string; timeMax: string },
  userId?: string,
): Promise<any[]> {
  if (!userId) return [];
  const provider = await getCalendarProvider(userId);
  if (!provider) return [];
  return provider.listEvents(params.timeMin, params.timeMax);
}
