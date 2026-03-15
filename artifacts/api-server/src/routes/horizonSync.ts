import { Router, type Request, type Response } from "express";
import { runHorizonSync } from "../lib/horizonSync";

const router = Router();

router.post("/horizon/sync", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const summary = await runHorizonSync(userId);
    res.json(summary);
  } catch (err: any) {
    console.error("Horizon sync error:", err.message);
    const msg = err.message || "Internal server error";
    if (msg.includes("not configured")) {
      res.status(503).json({ error: msg });
    } else if (msg.includes("authentication failed (401)")) {
      res.status(502).json({ error: msg });
    } else if (msg.includes("rate limited (429)")) {
      res.status(429).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
