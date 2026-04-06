import { describe, it, expect, vi } from "vitest";

// We test exported helpers — pull them in after mocking db
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  leadsTable: {},
  contactsTable: {},
  usersTable: {},
}));

// Import after mocking
const { buildLeadNotes, mapTopicToStatus } = await import("../lib/saSync.js");

describe("buildLeadNotes", () => {
  it("formats a full submission with no existing notes", () => {
    const result = buildLeadNotes(
      { name: "Alice", email: "alice@acme.com", message: "I want a demo", topic: "demo_request", company: "Acme Corp", phone: "555-1234", leadScore: 85 },
      null
    );
    expect(result).toBe(
      "[Topic: Demo Request]\nCompany: Acme Corp\nPhone: 555-1234\nLead Score: 85/100\n\nI want a demo"
    );
  });

  it("prepends new notes above existing notes with separator", () => {
    const result = buildLeadNotes(
      { name: "Alice", email: "alice@acme.com", message: "Follow-up question", topic: "support" },
      "Old manually entered notes"
    );
    expect(result).toBe(
      "[Topic: Support]\n\nFollow-up question\n\n---\n\nOld manually entered notes"
    );
  });

  it("omits Company/Phone/Lead Score lines when not provided", () => {
    const result = buildLeadNotes(
      { name: "Bob", email: "bob@b.com", message: "Hello", topic: "other" },
      null
    );
    expect(result).toBe("[Topic: Other]\n\nHello");
  });
});

describe("mapTopicToStatus", () => {
  it("returns qualified for demo_request", () => {
    expect(mapTopicToStatus("demo_request")).toBe("qualified");
  });
  it("returns qualified for partnership", () => {
    expect(mapTopicToStatus("partnership")).toBe("qualified");
  });
  it("returns new for other topics", () => {
    expect(mapTopicToStatus("support")).toBe("new");
    expect(mapTopicToStatus("feedback")).toBe("new");
    expect(mapTopicToStatus("other")).toBe("new");
  });
});
