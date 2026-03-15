import { type Request, type Response, type NextFunction } from "express";
import { getSessionId, getSession } from "../lib/auth";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }

  const sid = getSessionId(req);
  if (sid) {
    const session = await getSession(sid);
    if (!session?.twoFactorVerified) {
      res.status(403).json({ error: "2FA verification required" });
      return;
    }
  }

  next();
}
