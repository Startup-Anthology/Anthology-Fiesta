import bcrypt from "bcryptjs";
import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db, usersTable, userCredentialsTable, invitationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { seedDefaultSettings } from "../lib/seed";

const router: IRouter = Router();

const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip ?? req.socket?.remoteAddress ?? "unknown",
  message: { error: "Too many login attempts, please try again in a minute" },
});

const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip ?? req.socket?.remoteAddress ?? "unknown",
  message: { error: "Too many registration attempts, please try again later" },
});

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function sessionUserFromDb(dbUser: typeof usersTable.$inferSelect) {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImageUrl: dbUser.profileImageUrl,
    role: dbUser.role,
  };
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

router.post("/auth/register", registerRateLimit, async (req: Request, res: Response) => {
  const rawEmail = req.body.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  const { password, firstName, lastName } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    // Invite-only: check invitations table (admin users bypass this check)
    const [invitation] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.email, email));

    if (!invitation) {
      res.status(403).json({ error: "Registration is invite-only. Please ask an admin to invite you." });
      return;
    }

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
      })
      .returning();

    await db.insert(userCredentialsTable).values({
      userId: user.id,
      passwordHash,
    });

    await db.update(invitationsTable)
      .set({ usedAt: new Date() })
      .where(eq(invitationsTable.email, email));

    await seedDefaultSettings(user.id);

    const sessionData: SessionData = {
      user: sessionUserFromDb(user),
      access_token: "",
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.status(201).json({ token: sid, user: sessionData.user });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", loginRateLimit, async (req: Request, res: Response) => {
  const rawEmail = req.body.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  const { password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const [creds] = await db
      .select()
      .from(userCredentialsTable)
      .where(eq(userCredentialsTable.userId, user.id));

    if (!creds) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, creds.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const sessionData: SessionData = {
      user: sessionUserFromDb(user),
      access_token: "",
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.json({ token: sid, user: sessionData.user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

router.post("/auth/refresh", async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json({ user: sessionUserFromDb(user) });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Refresh failed" });
  }
});

router.put("/auth/profile", async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { firstName, lastName, profileImageUrl } = req.body;
    const updates: Record<string, string> = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.user.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      profileImageUrl: updated.profileImageUrl,
      role: updated.role,
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
