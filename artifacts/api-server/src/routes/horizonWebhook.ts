import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { leadsTable, contactsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fireAndForgetLeadSync, fireAndForgetContactSync } from "../lib/notionSync";
import { logAudit } from "../lib/audit";
import { validate, horizonLeadSchema, horizonContactSchema } from "../lib/validation";

const router = Router();

function verifyApiKey(req: Request, res: Response): boolean {
  const secret = process.env.HORIZON_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Webhook not configured" });
    return false;
  }
  const provided = req.headers["x-api-key"];
  if (provided !== secret) {
    res.status(401).json({ error: "Invalid API key" });
    return false;
  }
  return true;
}

async function getDefaultUserId(): Promise<string | null> {
  const configured = process.env.HORIZON_DEFAULT_USER_ID;
  if (configured) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, configured))
      .limit(1);
    return user?.id ?? null;
  }
  const [first] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .limit(1);
  return first?.id ?? null;
}

router.post("/webhooks/horizon/lead", async (req: Request, res: Response) => {
  try {
    if (!verifyApiKey(req, res)) return;

    const data = validate(horizonLeadSchema, req.body);

    const userId = await getDefaultUserId();
    if (!userId) {
      res.status(500).json({ error: "No active user found to assign lead" });
      return;
    }

    const [existing] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.email, data.email), eq(leadsTable.userId, userId)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(leadsTable)
        .set({
          name: data.name,
          ...(data.notes && { notes: data.notes }),
          ...(data.linkedinUrl && { linkedinUrl: data.linkedinUrl }),
          ...(data.profilePictureUrl && { profilePictureUrl: data.profilePictureUrl }),
          ...(data.isBeta !== undefined && { isBeta: data.isBeta }),
          source: "horizon",
          updatedAt: new Date(),
        })
        .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.userId, userId)))
        .returning();
      logAudit("lead", existing.id, "update", userId, existing as Record<string, unknown>, updated as Record<string, unknown>);
      fireAndForgetLeadSync(updated);
      res.status(200).json({ action: "updated", lead: updated });
      return;
    }

    const [lead] = await db
      .insert(leadsTable)
      .values({
        name: data.name,
        email: data.email,
        source: "horizon",
        status: data.status || "new",
        notes: data.notes || null,
        linkedinUrl: data.linkedinUrl || null,
        profilePictureUrl: data.profilePictureUrl || null,
        isBeta: data.isBeta ?? false,
        userId,
      })
      .returning();

    logAudit("lead", lead.id, "create", userId, null, lead as Record<string, unknown>);
    fireAndForgetLeadSync(lead);
    res.status(201).json({ action: "created", lead });
  } catch (err: any) {
    console.error("Horizon lead webhook error:", err.message);
    if (err.statusCode === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/webhooks/horizon/contact", async (req: Request, res: Response) => {
  try {
    if (!verifyApiKey(req, res)) return;

    const data = validate(horizonContactSchema, req.body);
    const combinedNotes = [data.message, data.notes].filter(Boolean).join("\n") || null;

    const userId = await getDefaultUserId();
    if (!userId) {
      res.status(500).json({ error: "No active user found to assign contact" });
      return;
    }

    const [existing] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.email, data.email), eq(contactsTable.userId, userId)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(contactsTable)
        .set({
          name: data.name,
          ...(data.phone && { phone: data.phone }),
          ...(data.company && { company: data.company }),
          ...(combinedNotes && { notes: combinedNotes }),
          updatedAt: new Date(),
        })
        .where(and(eq(contactsTable.id, existing.id), eq(contactsTable.userId, userId)))
        .returning();
      logAudit("contact", existing.id, "update", userId, existing as Record<string, unknown>, updated as Record<string, unknown>);
      fireAndForgetContactSync(updated);
      res.status(200).json({ action: "updated", contact: updated });
      return;
    }

    const [contact] = await db
      .insert(contactsTable)
      .values({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        company: data.company || null,
        notes: combinedNotes,
        relationshipType: "other",
        priority: "medium",
        userId,
      })
      .returning();

    logAudit("contact", contact.id, "create", userId, null, contact as Record<string, unknown>);
    fireAndForgetContactSync(contact);
    res.status(201).json({ action: "created", contact });
  } catch (err: any) {
    console.error("Horizon contact webhook error:", err.message);
    if (err.statusCode === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
