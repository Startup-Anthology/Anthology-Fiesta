import { Router, type Request, type Response } from "express";
import { upsertSALeads } from "../lib/saSync";
import { validate, saContactSchema } from "../lib/validation";

const router = Router();

function verifyApiKey(req: Request, res: Response): boolean {
  const secret = process.env.SA_WEBHOOK_SECRET;
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

router.post("/webhooks/sa/contact", async (req: Request, res: Response) => {
  try {
    if (!verifyApiKey(req, res)) return;

    if (!process.env.SA_DEFAULT_USER_ID) {
      res.status(503).json({ error: "SA_DEFAULT_USER_ID not configured" });
      return;
    }

    const data = validate(saContactSchema, req.body);

    const leadsResult = await upsertSALeads([data]);

    const leadAction = leadsResult.created > 0 ? "created" : "updated";

    res.status(leadsResult.created > 0 ? 201 : 200).json({
      lead: { action: leadAction },
    });
  } catch (err: any) {
    console.error("SA contact webhook error:", err.message);
    if (err.statusCode === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
