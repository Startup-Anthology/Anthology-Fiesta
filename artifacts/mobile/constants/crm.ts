export const LEAD_STATUSES = ["new", "contacted", "interested", "engaged", "converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  engaged: "Engaged",
  converted: "Converted",
};

export const STATUS_COLORS: Record<string, string> = {
  new: "#6366F1",
  contacted: "#3B82F6",
  interested: "#F59E0B",
  engaged: "#F97316",
  converted: "#10B981",
};

export const LEAD_SOURCES = ["twitter", "linkedin", "referral", "cold_outreach", "other"] as const;

export const REL_TYPES = ["investor", "partner", "advisor", "vendor", "press", "other"] as const;
export type RelationshipType = (typeof REL_TYPES)[number];

export const REL_COLORS: Record<string, string> = {
  investor: "#6366F1",
  partner: "#3B82F6",
  advisor: "#10B981",
  vendor: "#F59E0B",
  press: "#EF4444",
  other: "#6B7280",
};

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_COLORS: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#767676",
};

export const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  rollback: "Rolled back",
};

export const ACTION_COLORS: Record<string, string> = {
  create: "#10B981",
  update: "#3B82F6",
  delete: "#EF4444",
  rollback: "#F59E0B",
};
