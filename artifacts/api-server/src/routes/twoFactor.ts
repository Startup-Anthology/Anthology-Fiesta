import { Router, type Request, type Response, type NextFunction } from "express";
import * as OTPAuth from "otpauth";
import crypto from "crypto";
import { db, user2faTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getSessionId, getSession, updateSession } from "../lib/auth";

const router = Router();

router.get("/2fa/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const records = await db
      .select()
      .from(user2faTable)
      .where(eq(user2faTable.userId, req.user!.id));

    const totpRecord = records.find(r => r.method === "totp");
    const emailRecord = records.find(r => r.method === "email");
    const primaryRecord = totpRecord?.totpVerified ? totpRecord : (totpRecord || emailRecord);

    const sid = getSessionId(req);
    let twoFactorVerified = false;
    if (sid) {
      const session = await getSession(sid);
      twoFactorVerified = session?.twoFactorVerified === true;
    }

    res.json({
      enrolled: !!primaryRecord,
      method: primaryRecord?.method || null,
      totpVerified: totpRecord?.totpVerified || false,
      twoFactorVerified,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/2fa/totp/enroll", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [existing] = await db
      .select()
      .from(user2faTable)
      .where(and(eq(user2faTable.userId, req.user!.id), eq(user2faTable.method, "totp")));

    if (existing?.totpVerified) {
      res.status(409).json({ error: "TOTP already enrolled and verified" });
      return;
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: "Fiesta",
      label: req.user!.email || req.user!.id,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    if (existing) {
      await db
        .update(user2faTable)
        .set({ totpSecret: secret.base32, totpVerified: false })
        .where(eq(user2faTable.id, existing.id));
    } else {
      await db.insert(user2faTable).values({
        userId: req.user!.id,
        method: "totp",
        totpSecret: secret.base32,
        totpVerified: false,
      });
    }

    res.json({
      secret: secret.base32,
      uri: totp.toString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/2fa/totp/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: "Code is required" });
      return;
    }

    const [record] = await db
      .select()
      .from(user2faTable)
      .where(and(eq(user2faTable.userId, req.user!.id), eq(user2faTable.method, "totp")));

    if (!record?.totpSecret) {
      res.status(400).json({ error: "TOTP not enrolled" });
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: "Fiesta",
      label: req.user!.email || req.user!.id,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(record.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      res.status(401).json({ error: "Invalid code" });
      return;
    }

    if (!record.totpVerified) {
      await db
        .update(user2faTable)
        .set({ totpVerified: true })
        .where(eq(user2faTable.id, record.id));
    }

    const sid = getSessionId(req);
    if (sid) {
      const session = await getSession(sid);
      if (session) {
        session.twoFactorVerified = true;
        await updateSession(sid, session);
      }
    }

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});

router.post("/2fa/email/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!req.user!.email) {
      res.status(400).json({ error: "No email address on file" });
      return;
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const [existing] = await db
      .select()
      .from(user2faTable)
      .where(and(eq(user2faTable.userId, req.user!.id), eq(user2faTable.method, "email")));

    if (existing) {
      await db
        .update(user2faTable)
        .set({ emailCode: code, emailCodeExpiresAt: expiresAt })
        .where(eq(user2faTable.id, existing.id));
    } else {
      await db.insert(user2faTable).values({
        userId: req.user!.id,
        method: "email",
        emailCode: code,
        emailCodeExpiresAt: expiresAt,
      });
    }

    try {
      const { sendEmail } = await import("../lib/gmail");
      await sendEmail({
        to: req.user!.email,
        subject: "Fiesta - Your verification code",
        body: `Your Fiesta admin verification code is: ${code}\n\nThis code expires in 10 minutes.`,
      });
      res.json({ sent: true });
    } catch (emailErr) {
      console.error("Failed to send 2FA email:", emailErr);
      res.status(500).json({ error: "Failed to send verification email. Please try again." });
    }
  } catch (err) {
    next(err);
  }
});

router.post("/2fa/email/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: "Code is required" });
      return;
    }

    const [record] = await db
      .select()
      .from(user2faTable)
      .where(and(eq(user2faTable.userId, req.user!.id), eq(user2faTable.method, "email")));

    if (!record?.emailCode) {
      res.status(400).json({ error: "No email code pending" });
      return;
    }

    if (record.emailCodeExpiresAt && record.emailCodeExpiresAt < new Date()) {
      res.status(401).json({ error: "Code has expired" });
      return;
    }

    if (record.emailCode !== code) {
      res.status(401).json({ error: "Invalid code" });
      return;
    }

    await db
      .update(user2faTable)
      .set({ emailCode: null, emailCodeExpiresAt: null })
      .where(eq(user2faTable.id, record.id));

    const sid = getSessionId(req);
    if (sid) {
      const session = await getSession(sid);
      if (session) {
        session.twoFactorVerified = true;
        await updateSession(sid, session);
      }
    }

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});

export default router;
