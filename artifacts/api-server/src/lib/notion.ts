async function notionProxy(path: string, method: string = "GET", body?: any) {
  try {
    const connectors = (await import("@replit/connectors-sdk")).default;
    const options: any = { method };
    if (body) {
      options.body = JSON.stringify(body);
      options.headers = { "Content-Type": "application/json" };
    }
    const res = await connectors.proxy("notion", `/v1${path}`, options);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Notion API error ${res.status}: ${text}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error("Notion proxy error:", err);
    return null;
  }
}

export async function syncLeadToNotion(lead: any, databaseId: string): Promise<string | null> {
  try {
    if (lead.notionPageId) {
      await notionProxy(`/pages/${lead.notionPageId}`, "PATCH", {
        properties: {
          Name: { title: [{ text: { content: lead.name } }] },
          Email: { email: lead.email },
          Status: { select: { name: lead.status } },
          Source: { select: { name: lead.source } },
          "Is Beta": { checkbox: lead.isBeta },
        },
      });
      return lead.notionPageId;
    } else {
      const res = await notionProxy("/pages", "POST", {
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: lead.name } }] },
          Email: { email: lead.email },
          Status: { select: { name: lead.status } },
          Source: { select: { name: lead.source } },
          "Is Beta": { checkbox: lead.isBeta },
        },
      });
      return res?.id || null;
    }
  } catch (err) {
    console.error("Notion sync error:", err);
    return null;
  }
}

export async function syncContactToNotion(contact: any, databaseId: string): Promise<string | null> {
  try {
    if (contact.notionPageId) {
      await notionProxy(`/pages/${contact.notionPageId}`, "PATCH", {
        properties: {
          Name: { title: [{ text: { content: contact.name } }] },
          Email: contact.email ? { email: contact.email } : undefined,
          Company: contact.company ? { rich_text: [{ text: { content: contact.company } }] } : undefined,
          Type: { select: { name: contact.relationshipType } },
          Priority: { select: { name: contact.priority } },
        },
      });
      return contact.notionPageId;
    } else {
      const res = await notionProxy("/pages", "POST", {
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: contact.name } }] },
          Email: contact.email ? { email: contact.email } : undefined,
          Company: contact.company ? { rich_text: [{ text: { content: contact.company } }] } : undefined,
          Type: { select: { name: contact.relationshipType } },
          Priority: { select: { name: contact.priority } },
        },
      });
      return res?.id || null;
    }
  } catch (err) {
    console.error("Notion sync error:", err);
    return null;
  }
}

export async function syncActivityToNotion(activity: any, databaseId: string): Promise<string | null> {
  try {
    const res = await notionProxy("/pages", "POST", {
      parent: { database_id: databaseId },
      properties: {
        Type: { title: [{ text: { content: activity.type } }] },
        Direction: activity.direction ? { select: { name: activity.direction } } : undefined,
        Subject: activity.subject ? { rich_text: [{ text: { content: activity.subject } }] } : undefined,
        Note: activity.note ? { rich_text: [{ text: { content: activity.note } }] } : undefined,
      },
    });
    return res?.id || null;
  } catch (err) {
    console.error("Notion sync error:", err);
    return null;
  }
}
