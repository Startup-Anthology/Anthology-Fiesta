// Direct Notion API — replaces the old @replit/connectors-sdk proxy.
// These functions require a per-user access token.
// For fire-and-forget syncs, see notionSync.ts which calls getNotesProvider().

export async function syncLeadToNotion(lead: any, databaseId: string, accessToken?: string): Promise<string | null> {
  if (!accessToken) return null;
  const { NotionProvider } = await import("./integrations/notes/notion");
  return new NotionProvider(accessToken).syncLead(lead, databaseId);
}

export async function syncContactToNotion(contact: any, databaseId: string, accessToken?: string): Promise<string | null> {
  if (!accessToken) return null;
  const { NotionProvider } = await import("./integrations/notes/notion");
  return new NotionProvider(accessToken).syncContact(contact, databaseId);
}

export async function syncActivityToNotion(activity: any, databaseId: string, accessToken?: string): Promise<string | null> {
  if (!accessToken) return null;
  const { NotionProvider } = await import("./integrations/notes/notion");
  return new NotionProvider(accessToken).syncActivity(activity, databaseId);
}
