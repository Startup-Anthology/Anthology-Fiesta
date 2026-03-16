import { type Request, type Response, type NextFunction } from "express";
import { getSessionId, getSession } from "../lib/auth";
import { db, user2faTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }

  const [twoFaRecord] = await db.select().from(user2faTable)
    .where(and(eq(user2faTable.userId, req.user!.id), eq(user2faTable.totpVerified, true)));
  if (!twoFaRecord) {
    res.status(403).json({ error: "Admin 2FA enrollment required" });
    return;
  }

  const sid = getSessionId(req);
  if (!sid) {
    res.status(403).json({ error: "2FA session verification required" });
    return;
  }
  const session = await getSession(sid);
  if (!session?.twoFactorVerified) {
    res.status(403).json({ error: "2FA verification required" });
    return;
  }

  next();
}
