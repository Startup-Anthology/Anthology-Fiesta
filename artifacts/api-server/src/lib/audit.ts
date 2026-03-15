import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";

export function logAudit(
  entityType: string,
  entityId: number,
  action: "create" | "update" | "delete" | "rollback",
  userId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
) {
  const afterSnapshot = action === "delete" && !after && before ? before : after;

  db.insert(auditLogTable)
    .values({
      entityType,
      entityId,
      action,
      userId,
      beforeSnapshot: before,
      afterSnapshot,
    })
    .then(() => {})
    .catch((err) => {
      console.error(`Audit log failed [${action} ${entityType}:${entityId}]:`, err);
    });
}
