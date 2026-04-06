import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock saSync before importing the router
vi.mock("../lib/saSync.js", () => ({
  upsertSALeads: vi.fn(),
}));

const { upsertSALeads } = await import("../lib/saSync.js");
const saWebhookRouter = (await import("../routes/saWebhook.js")).default;

const app = express();
app.use(express.json());
app.use(saWebhookRouter);

const validPayload = {
  name: "Alice",
  email: "alice@example.com",
  message: "I want a demo",
  topic: "demo_request",
};

beforeEach(() => {
  vi.stubEnv("SA_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("SA_DEFAULT_USER_ID", "user-uuid-123");
  vi.mocked(upsertSALeads).mockResolvedValue({ created: 1, updated: 0, errors: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /webhooks/sa/contact", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await request(app).post("/webhooks/sa/contact").send(validPayload);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid API key");
  });

  it("returns 401 when x-api-key header is wrong", async () => {
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "wrong-secret")
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it("returns 503 when SA_WEBHOOK_SECRET is not set", async () => {
    vi.stubEnv("SA_WEBHOOK_SECRET", "");
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Webhook not configured");
  });

  it("returns 503 when SA_DEFAULT_USER_ID is not set", async () => {
    vi.stubEnv("SA_DEFAULT_USER_ID", "");
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("SA_DEFAULT_USER_ID not configured");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send({ name: "Alice" }); // missing email, message, topic
    expect(res.status).toBe(400);
  });

  it("returns 201 when a new lead is created", async () => {
    vi.mocked(upsertSALeads).mockResolvedValue({ created: 1, updated: 0, errors: [] });
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ lead: { action: "created" } });
  });

  it("returns 200 when an existing lead is updated", async () => {
    vi.mocked(upsertSALeads).mockResolvedValue({ created: 0, updated: 1, errors: [] });
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lead: { action: "updated" } });
  });

  it("returns 500 when upsertSALeads throws", async () => {
    vi.mocked(upsertSALeads).mockRejectedValue(new Error("DB connection failed"));
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(500);
  });
});
