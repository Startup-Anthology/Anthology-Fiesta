import { db, settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getMessagingProvider } from "./integrations/registry";

async function getSlackChannelForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, "slack_channel_id"), eq(settingsTable.userId, userId)));
  return rows[0]?.value || null;
}

export function fireAndForgetSlackNotify(
  userId: string,
  event: string,
  data: Record<string, unknown>,
) {
  Promise.all([
    getSlackChannelForUser(userId),
    getMessagingProvider(userId),
  ]).then(async ([channelId, provider]) => {
    if (!channelId || !provider) return;

    let text = "";
    const blocks: unknown[] = [];

    switch (event) {
      case "lead_created": {
        const name = data.name as string;
        const email = data.email as string;
        text = `New lead: ${name} (${email})`;
        blocks.push(
          { type: "section", text: { type: "mrkdwn", text: `*New Lead Added*\n>${name} — ${email}` } },
          { type: "context", elements: [{ type: "mrkdwn", text: `Source: ${data.source || "manual"} | Status: ${data.status || "new"}` }] },
        );
        break;
      }
      case "lead_status_changed": {
        const name = data.name as string;
        const from = data.oldStatus as string;
        const to = data.newStatus as string;
        text = `Lead "${name}" moved from ${from} to ${to}`;
        blocks.push(
          { type: "section", text: { type: "mrkdwn", text: `*Lead Status Changed*\n>${name}: _${from}_ → *${to}*` } },
        );
        break;
      }
      case "contact_created": {
        const name = data.name as string;
        const type = data.relationshipType as string;
        text = `New contact: ${name} (${type})`;
        blocks.push(
          { type: "section", text: { type: "mrkdwn", text: `*New Contact Added*\n>${name} — ${type}` } },
        );
        break;
      }
      case "sequence_enrolled": {
        const seqName = data.sequenceName as string;
        const entityName = data.entityName as string;
        text = `"${entityName}" enrolled in sequence "${seqName}"`;
        blocks.push(
          { type: "section", text: { type: "mrkdwn", text: `*Sequence Enrollment*\n>${entityName} enrolled in "${seqName}"` } },
        );
        break;
      }
      case "horizon_sync": {
        const leadsCreated = data.leadsCreated as number;
        const contactsCreated = data.contactsCreated as number;
        text = `Horizon sync: ${leadsCreated} new leads, ${contactsCreated} new contacts`;
        blocks.push(
          { type: "section", text: { type: "mrkdwn", text: `*Horizon Sync Complete*\n>Leads: ${leadsCreated} new, ${data.leadsUpdated} updated\n>Contacts: ${contactsCreated} new, ${data.contactsUpdated} updated` } },
        );
        break;
      }
      case "sa_sync": {
        const leadsCreated = data.leadsCreated as number;
        const contactsCreated = data.contactsCreated as number;
        text = `SA sync: ${leadsCreated} new leads, ${contactsCreated} new contacts`;
        blocks.push(
          { type: "section", text: { type: "mrkdwn", text: `*Startup Anthology Sync Complete*\n>Leads: ${leadsCreated} new, ${data.leadsUpdated} updated\n>Contacts: ${contactsCreated} new, ${data.contactsUpdated} updated` } },
        );
        break;
      }
      default:
        text = `CRM event: ${event}`;
    }

    try {
      await provider.sendMessage(channelId, text, blocks);
    } catch (err) {
      console.error("Slack notification failed:", err);
    }
  }).catch((err) => console.error("Slack notify setup failed:", err));
}
