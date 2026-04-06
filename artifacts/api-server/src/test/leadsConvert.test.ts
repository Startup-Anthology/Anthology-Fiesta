import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock db and dependencies
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  leadsTable: { id: "id", userId: "userId", email: "email", status: "status" },
  contactsTable: { id: "id", userId: "userId", email: "email" },
  triggerRulesTable: { triggerStatus: "triggerStatus", userId: "userId" },
  dripEnrollmentsTable: {},
  activitiesTable: {},
}));

vi.mock("../lib/notionSync.js", () => ({
  fireAndForgetLeadSync: vi.fn(),
  fireAndForgetActivitySync: vi.fn(),
  fireAndForgetContactSync: vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({
  logAudit: vi.fn(),
}));

vi.mock("../lib/slackNotify.js", () => ({
  fireAndForgetSlackNotify: vi.fn(),
}));

// Import after mocks
const leadsRouter = (await import("../routes/leads.js")).default;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.user = { id: "user-1" };
  next();
});
app.use(leadsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err.statusCode) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal server error" });
  }
});

const { db } = await import("@workspace/db");

function makeChain(resolveWith: any) {
  // Make the chain thenable so `await chain` resolves directly (for findOwned which awaits .where()),
  // and also have .limit() and .returning() resolve the same value (for other queries).
  const chain: any = {
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(resolveWith).then(onFulfilled, onRejected);
    },
  };
  const methods = ["from", "where", "limit", "set", "values", "returning"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

const fakeLead = { id: 1, userId: "user-1", name: "Alice", email: "alice@example.com", status: "qualified", notes: null };
const fakeContact = { id: 10, userId: "user-1", name: "Alice", email: "alice@example.com", relationshipType: "customer", priority: "medium", company: null, phone: null };
const fakeUpdatedLead = { ...fakeLead, status: "converted" };

describe("POST /leads/:id/convert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when lead is not found", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));
    const res = await request(app).post("/leads/99/convert").send({});
    expect(res.status).toBe(404);
  });

  it("returns 409 when lead is already converted", async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ ...fakeLead, status: "converted" }]));
    const res = await request(app).post("/leads/1/convert").send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Lead already converted");
  });

  it("returns 409 when a contact with the same email already exists", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([fakeLead]))
      .mockReturnValueOnce(makeChain([fakeContact]));
    const res = await request(app).post("/leads/1/convert").send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Contact already exists for this email");
  });

  it("returns 200 with lead and contact on happy path (no body)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([fakeLead]))
      .mockReturnValueOnce(makeChain([]));
    vi.mocked(db.insert).mockReturnValue(makeChain([fakeContact]));
    vi.mocked(db.update).mockReturnValue(makeChain([fakeUpdatedLead]));

    const res = await request(app).post("/leads/1/convert").send({});
    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe("converted");
    expect(res.body.contact.relationshipType).toBe("customer");
    expect(res.body.contact.priority).toBe("medium");
  });

  it("passes company and phone from body to the new contact", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([fakeLead]))
      .mockReturnValueOnce(makeChain([]));
    vi.mocked(db.insert).mockReturnValue(makeChain([{ ...fakeContact, company: "Acme", phone: "555-0000" }]));
    vi.mocked(db.update).mockReturnValue(makeChain([fakeUpdatedLead]));

    const res = await request(app)
      .post("/leads/1/convert")
      .send({ company: "Acme", phone: "555-0000" });
    expect(res.status).toBe(200);
    expect(res.body.contact.company).toBe("Acme");
    expect(res.body.contact.phone).toBe("555-0000");
  });
});
