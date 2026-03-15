import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  auditLogTable,
  leadsTable,
  contactsTable,
  emailTemplatesTable,
  dripSequencesTable,
  dripSequenceStepsTable,
  calendarEventsTable,
  settingsTable,
  triggerRulesTable,
  broadcastsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { logAudit } from "../lib/audit";
import { parseIntParam, notFound, badRequest } from "../lib/errors";

const router = Router();

interface EntityDescriptor {
  table: PgTable;
  idCol: PgColumn;
  userCol: PgColumn | null;
  hasUpdatedAt: boolean;
}

const ENTITY_MAP: Record<string, EntityDescriptor> = {
  lead: { table: leadsTable, idCol: leadsTable.id, userCol: leadsTable.userId, hasUpdatedAt: true },
  contact: { table: contactsTable, idCol: contactsTable.id, userCol: contactsTable.userId, hasUpdatedAt: true },
  template: { table: emailTemplatesTable, idCol: emailTemplatesTable.id, userCol: emailTemplatesTable.userId, hasUpdatedAt: true },
  sequence: { table: dripSequencesTable, idCol: dripSequencesTable.id, userCol: dripSequencesTable.userId, hasUpdatedAt: true },
  sequence_step: { table: dripSequenceStepsTable, idCol: dripSequenceStepsTable.id, userCol: null, hasUpdatedAt: false },
  calendar_event: { table: calendarEventsTable, idCol: calendarEventsTable.id, userCol: calendarEventsTable.userId, hasUpdatedAt: false },
  trigger: { table: triggerRulesTable, idCol: triggerRulesTable.id, userCol: triggerRulesTable.userId, hasUpdatedAt: false },
  broadcast: { table: broadcastsTable, idCol: broadcastsTable.id, userCol: broadcastsTable.userId, hasUpdatedAt: false },
  setting: { table: settingsTable, idCol: settingsTable.id, userCol: settingsTable.userId, hasUpdatedAt: true },
};

const PLURAL_TO_ENTITY: Record<string, string> = {
  leads: "lead",
  contacts: "contact",
  templates: "template",
  sequences: "sequence",
  sequence_steps: "sequence_step",
  calendar_events: "calendar_event",
  triggers: "trigger",
  broadcasts: "broadcast",
  settings: "setting",
};

async function verifyOwnership(
  descriptor: EntityDescriptor,
  entityType: string,
  entityId: number,
  userId: string
): Promise<boolean> {
  if (entityType === "sequence_step") {
    const [step] = await db
      .select({ sequenceId: dripSequenceStepsTable.sequenceId })
      .from(dripSequenceStepsTable)
      .where(eq(dripSequenceStepsTable.id, entityId));
    if (!step) return false;
    const [seq] = await db
      .select({ id: dripSequencesTable.id })
      .from(dripSequencesTable)
      .where(and(eq(dripSequencesTable.id, step.sequenceId), eq(dripSequencesTable.userId, userId)));
    return !!seq;
  }

  if (!descriptor.userCol) return false;
  const [record] = await db
    .select()
    .from(descriptor.table)
    .where(and(eq(descriptor.idCol, entityId), eq(descriptor.userCol, userId)));
  return !!record;
}

function resolveEntityType(raw: string): string | null {
  if (ENTITY_MAP[raw]) return raw;
  if (PLURAL_TO_ENTITY[raw]) return PLURAL_TO_ENTITY[raw];
  return null;
}

async function handleHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const rawEntityType = req.params.entityType;
    const entityId = req.params.entityId || req.params.id;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const entityType = resolveEntityType(rawEntityType);
    if (!entityType) throw badRequest("Invalid entity type");

    const descriptor = ENTITY_MAP[entityType];
    const numericId = parseIntParam(String(entityId));
    const owned = await verifyOwnership(descriptor, entityType, numericId, userId);

    if (!owned) {
      const [ownedAudit] = await db
        .select({ id: auditLogTable.id })
        .from(auditLogTable)
        .where(
          and(
            eq(auditLogTable.entityType, entityType),
            eq(auditLogTable.entityId, numericId),
            eq(auditLogTable.userId, userId)
          )
        )
        .limit(1);

      if (!ownedAudit) throw notFound("Entity not found");
    }

    const entries = await db
      .select({
        id: auditLogTable.id,
        entityType: auditLogTable.entityType,
        entityId: auditLogTable.entityId,
        action: auditLogTable.action,
        userId: auditLogTable.userId,
        beforeSnapshot: auditLogTable.beforeSnapshot,
        afterSnapshot: auditLogTable.afterSnapshot,
        createdAt: auditLogTable.createdAt,
      })
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, entityType),
          eq(auditLogTable.entityId, numericId),
          eq(auditLogTable.userId, userId)
        )
      )
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(entries.filter((e) => e.userId).map((e) => e.userId!))];
    const userNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const users = await db
        .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds));
      for (const u of users) {
        userNames[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
      }
    }

    const results = entries.map((e) => ({
      ...e,
      userName: e.userId ? userNames[e.userId] || e.userId : null,
    }));

    res.json(results);
  } catch (err) {
    next(err);
  }
}

async function handleRollback(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const rawEntityType = req.params.entityType;
    const entityId = req.params.entityId || req.params.id;
    const { revisionId } = req.params;

    const entityType = resolveEntityType(rawEntityType);
    if (!entityType) throw badRequest("Invalid entity type");

    const descriptor = ENTITY_MAP[entityType];
    const numericId = parseIntParam(String(entityId));
    const numericRevisionId = parseIntParam(revisionId, "revisionId");
    const owned = await verifyOwnership(descriptor, entityType, numericId, userId);

    if (!owned) {
      const [ownedAudit] = await db
        .select({ userId: auditLogTable.userId })
        .from(auditLogTable)
        .where(
          and(
            eq(auditLogTable.entityType, entityType),
            eq(auditLogTable.entityId, numericId),
            eq(auditLogTable.userId, userId)
          )
        )
        .limit(1);
      if (!ownedAudit) throw notFound("Entity not found");
    }

    const [auditEntry] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.id, numericRevisionId),
          eq(auditLogTable.entityType, entityType),
          eq(auditLogTable.entityId, numericId)
        )
      );

    if (!auditEntry) throw notFound("Revision not found");

    let snapshot: Record<string, unknown> | null = null;
    switch (auditEntry.action) {
      case "update":
        snapshot = auditEntry.beforeSnapshot as Record<string, unknown> | null;
        break;
      case "delete":
        snapshot = (auditEntry.afterSnapshot ?? auditEntry.beforeSnapshot) as Record<string, unknown> | null;
        break;
      case "create":
        snapshot = auditEntry.afterSnapshot as Record<string, unknown> | null;
        break;
      case "rollback":
        snapshot = auditEntry.afterSnapshot as Record<string, unknown> | null;
        break;
    }
    if (!snapshot) throw badRequest("This revision cannot be used for rollback");
    const restoreData = snapshot;

    const { id: _id, createdAt: _ca, updatedAt: _ua, userId: _uid, ...safeData } = restoreData;

    const setData: Record<string, unknown> = { ...safeData };
    if (descriptor.hasUpdatedAt) {
      setData.updatedAt = new Date();
    }

    let result: Record<string, unknown>;
    let beforeState: Record<string, unknown> | null = null;

    if (owned) {
      const [current] = await db
        .select()
        .from(descriptor.table)
        .where(eq(descriptor.idCol, numericId));
      beforeState = current as Record<string, unknown>;

      const [updated] = await db
        .update(descriptor.table)
        .set(setData)
        .where(and(eq(descriptor.idCol, numericId), ...(descriptor.userCol ? [eq(descriptor.userCol, userId)] : [])))
        .returning();
      result = updated as Record<string, unknown>;
    } else {
      const insertData: Record<string, unknown> = { ...safeData, id: numericId };
      if (descriptor.userCol) {
        insertData.userId = userId;
      }
      if (descriptor.hasUpdatedAt) {
        insertData.updatedAt = new Date();
      }
      const [inserted] = await db
        .insert(descriptor.table)
        .values(insertData)
        .returning();
      result = inserted as Record<string, unknown>;
    }

    logAudit(entityType, numericId, "rollback", userId, beforeState, result);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

router.get("/history/:entityType/:entityId", handleHistory);
router.get("/:entityType/:id/history", handleHistory);

router.post("/history/:entityType/:entityId/rollback/:revisionId", handleRollback);
router.post("/:entityType/:id/rollback/:revisionId", handleRollback);

export default router;
