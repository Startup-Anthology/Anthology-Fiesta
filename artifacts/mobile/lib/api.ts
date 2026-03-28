import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/api";
import * as storage from "./secureStorage";

type SessionExpiredListener = () => void;
const sessionExpiredListeners: Set<SessionExpiredListener> = new Set();

export function onSessionExpired(fn: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

function notifySessionExpired() {
  sessionExpiredListeners.forEach((fn) => fn());
}

const BASE = getApiBaseUrl();
const AUTH_TOKEN_KEY = "auth_session_token";

async function request(path: string, options?: RequestInit) {
  const url = `${BASE}${path}`;
  const token = await storage.getItem(AUTH_TOKEN_KEY);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401) {
    await storage.deleteItem(AUTH_TOKEN_KEY);
    notifySessionExpired();
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMsg = `API error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) errorMsg = parsed.error;
    } catch {
      if (text) errorMsg = text;
    }
    throw new Error(errorMsg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function uploadFile(path: string, uri: string, fileName: string, mimeType: string) {
  const url = `${BASE}${path}`;
  const token = await storage.getItem(AUTH_TOKEN_KEY);

  const formData = new FormData();
  if (Platform.OS === "web") {
    // Web: fetch blob URL into a File object for standard FormData
    const response = await fetch(uri);
    const blob = await response.blob();
    formData.append("file", new File([blob], fileName, { type: mimeType }));
  } else {
    // Native: React Native FormData accepts { uri, name, type }
    formData.append("file", {
      uri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  if (res.status === 401) {
    await storage.deleteItem(AUTH_TOKEN_KEY);
    notifySessionExpired();
    throw new Error("SESSION_EXPIRED");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMsg = `API error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) errorMsg = parsed.error;
    } catch {
      if (text) errorMsg = text;
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

async function streamRequest(
  path: string,
  body: any,
  onChunk: (data: { content?: string; done?: boolean; error?: string }) => void
): Promise<{ conversationId: number | null }> {
  const url = `${BASE}${path}`;
  const token = await storage.getItem(AUTH_TOKEN_KEY);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    await storage.deleteItem(AUTH_TOKEN_KEY);
    notifySessionExpired();
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `API error ${res.status}`);
  }

  const convIdHeader = res.headers.get("x-conversation-id");
  const conversationId = convIdHeader ? Number(convIdHeader) : null;

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          onChunk(data);
        } catch {}
      }
    }
  }

  return { conversationId };
}

export { streamRequest };

export const api = {
  getDashboard: () => request("/dashboard"),

  getLeads: (params?: { status?: string; isBeta?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.isBeta !== undefined) sp.set("isBeta", String(params.isBeta));
    const qs = sp.toString();
    return request(`/leads${qs ? `?${qs}` : ""}`);
  },
  createLead: (data: any) =>
    request("/leads", { method: "POST", body: JSON.stringify(data) }),
  getLead: (id: number) => request(`/leads/${id}`),
  updateLead: (id: number, data: any) =>
    request(`/leads/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLead: (id: number) =>
    request(`/leads/${id}`, { method: "DELETE" }),
  updateLeadStatus: (id: number, status: string) =>
    request(`/leads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getContacts: (params?: { relationshipType?: string; priority?: string }) => {
    const sp = new URLSearchParams();
    if (params?.relationshipType) sp.set("relationshipType", params.relationshipType);
    if (params?.priority) sp.set("priority", params.priority);
    const qs = sp.toString();
    return request(`/contacts${qs ? `?${qs}` : ""}`);
  },
  createContact: (data: any) =>
    request("/contacts", { method: "POST", body: JSON.stringify(data) }),
  getContact: (id: number) => request(`/contacts/${id}`),
  updateContact: (id: number, data: any) =>
    request(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteContact: (id: number) =>
    request(`/contacts/${id}`, { method: "DELETE" }),
  markContacted: (id: number) =>
    request(`/contacts/${id}/mark-contacted`, { method: "POST" }),
  getFollowUps: () => request("/contacts/follow-ups"),

  getActivities: (params?: { leadId?: number; contactId?: number }) => {
    const sp = new URLSearchParams();
    if (params?.leadId) sp.set("leadId", String(params.leadId));
    if (params?.contactId) sp.set("contactId", String(params.contactId));
    const qs = sp.toString();
    return request(`/activities${qs ? `?${qs}` : ""}`);
  },
  createActivity: (data: any) =>
    request("/activities", { method: "POST", body: JSON.stringify(data) }),
  updateActivity: (id: number, data: any) =>
    request(`/activities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getTemplates: (audience?: string) => {
    const qs = audience ? `?audience=${audience}` : "";
    return request(`/templates${qs}`);
  },
  createTemplate: (data: any) =>
    request("/templates", { method: "POST", body: JSON.stringify(data) }),
  getTemplate: (id: number) => request(`/templates/${id}`),
  updateTemplate: (id: number, data: any) =>
    request(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id: number) =>
    request(`/templates/${id}`, { method: "DELETE" }),

  getSequences: () => request("/sequences"),
  createSequence: (data: any) =>
    request("/sequences", { method: "POST", body: JSON.stringify(data) }),
  getSequence: (id: number) => request(`/sequences/${id}`),
  updateSequence: (id: number, data: any) =>
    request(`/sequences/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSequence: (id: number) =>
    request(`/sequences/${id}`, { method: "DELETE" }),
  addSequenceStep: (id: number, data: any) =>
    request(`/sequences/${id}/steps`, { method: "POST", body: JSON.stringify(data) }),
  enrollInSequence: (id: number, data: { leadId?: number; contactId?: number }) =>
    request(`/sequences/${id}/enroll`, { method: "POST", body: JSON.stringify(data) }),

  getBroadcasts: () => request("/broadcasts"),
  createBroadcast: (data: any) =>
    request("/broadcasts", { method: "POST", body: JSON.stringify(data) }),
  previewBroadcastRecipients: (leadStatuses: string[], contactTypes: string[]) => {
    const params = new URLSearchParams();
    if (leadStatuses.length > 0) params.set("leadStatuses", leadStatuses.join(","));
    if (contactTypes.length > 0) params.set("contactTypes", contactTypes.join(","));
    return request(`/broadcast-preview?${params.toString()}`);
  },

  getTriggerRules: () => request("/triggers"),
  createTriggerRule: (data: any) =>
    request("/triggers", { method: "POST", body: JSON.stringify(data) }),
  deleteTriggerRule: (id: number) =>
    request(`/triggers/${id}`, { method: "DELETE" }),

  getSettings: () => request("/settings"),
  updateSettings: (data: Record<string, string>) =>
    request("/settings", { method: "PUT", body: JSON.stringify(data) }),

  sendEmail: (data: { to: string; subject: string; body: string; leadId?: number; contactId?: number; attachmentFileIds?: number[] }) =>
    request("/email/send", { method: "POST", body: JSON.stringify(data) }),

  getCalendarEvents: (params?: { startDate?: string; endDate?: string; leadId?: number; contactId?: number }) => {
    const sp = new URLSearchParams();
    if (params?.startDate) sp.set("startDate", params.startDate);
    if (params?.endDate) sp.set("endDate", params.endDate);
    if (params?.leadId) sp.set("leadId", String(params.leadId));
    if (params?.contactId) sp.set("contactId", String(params.contactId));
    const qs = sp.toString();
    return request(`/calendar/events${qs ? `?${qs}` : ""}`);
  },
  createCalendarEvent: (data: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    leadId?: number;
    contactId?: number;
    eventType?: string;
  }) => request("/calendar/events", { method: "POST", body: JSON.stringify(data) }),
  updateCalendarEvent: (id: number, data: any) =>
    request(`/calendar/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCalendarEvent: (id: number) =>
    request(`/calendar/events/${id}`, { method: "DELETE" }),
  syncCalendar: () => request("/calendar/sync"),

  updateProfile: (data: { firstName?: string; lastName?: string; profileImageUrl?: string }) =>
    request("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  getAdminUsers: () => request("/admin/users"),
  createAdminUser: (data: { email: string; firstName?: string; lastName?: string; role?: string }) =>
    request("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateAdminUser: (id: string, data: { role?: string; isActive?: boolean }) =>
    request(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  getHistory: (entityType: string, entityId: number, params?: { limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.offset) sp.set("offset", String(params.offset));
    const qs = sp.toString();
    return request(`/history/${entityType}/${entityId}${qs ? `?${qs}` : ""}`);
  },
  rollback: (entityType: string, entityId: number, revisionId: number) =>
    request(`/history/${entityType}/${entityId}/rollback/${revisionId}`, { method: "POST" }),
  getFiles: () => request("/files"),
  uploadFile: (uri: string, fileName: string, mimeType: string) =>
    uploadFile("/files/upload", uri, fileName, mimeType),
  deleteFile: (id: number) =>
    request(`/files/${id}`, { method: "DELETE" }),

  getLeadFiles: (leadId: number) => request(`/leads/${leadId}/files`),
  uploadLeadFile: (leadId: number, uri: string, fileName: string, mimeType: string) =>
    uploadFile(`/leads/${leadId}/files`, uri, fileName, mimeType),
  attachFileToLead: (leadId: number, fileId: number) =>
    request(`/leads/${leadId}/files`, { method: "POST", body: JSON.stringify({ fileId }) }),
  removeLeadFile: (leadId: number, fileId: number) =>
    request(`/leads/${leadId}/files/${fileId}`, { method: "DELETE" }),

  getContactFiles: (contactId: number) => request(`/contacts/${contactId}/files`),
  uploadContactFile: (contactId: number, uri: string, fileName: string, mimeType: string) =>
    uploadFile(`/contacts/${contactId}/files`, uri, fileName, mimeType),
  attachFileToContact: (contactId: number, fileId: number) =>
    request(`/contacts/${contactId}/files`, { method: "POST", body: JSON.stringify({ fileId }) }),
  removeContactFile: (contactId: number, fileId: number) =>
    request(`/contacts/${contactId}/files/${fileId}`, { method: "DELETE" }),

  getAiConversations: () => request("/ai/conversations"),
  getAiMessages: (conversationId: number) => request(`/ai/conversations/${conversationId}/messages`),
  deleteAiConversation: (conversationId: number) =>
    request(`/ai/conversations/${conversationId}`, { method: "DELETE" }),
  getAiInsights: (params?: { leadId?: number; contactId?: number; status?: string }) => {
    const sp = new URLSearchParams();
    if (params?.leadId) sp.set("leadId", String(params.leadId));
    if (params?.contactId) sp.set("contactId", String(params.contactId));
    if (params?.status) sp.set("status", params.status);
    const qs = sp.toString();
    return request(`/ai/insights${qs ? `?${qs}` : ""}`);
  },
  dismissAiInsight: (id: number) =>
    request(`/ai/insights/${id}/dismiss`, { method: "PATCH" }),
  getOnboardingGreeting: () => request("/ai/onboarding-greeting"),
  saveOnboardingProgress: (topic: string) =>
    request("/ai/onboarding-progress", { method: "POST", body: JSON.stringify({ topic }) }),
  sendChatSync: (message: string, conversationId?: number | null) =>
    request("/ai/chat/sync", {
      method: "POST",
      body: JSON.stringify({ message, conversationId: conversationId || undefined }),
    }) as Promise<{ content: string; conversationId: number }>,
  generateAiInsights: () =>
    request("/ai/generate-insights", { method: "POST" }),
  syncFromHorizon: () =>
    request("/horizon/sync", { method: "POST" }),
  getDiagnostics: () => request("/admin/diagnostics"),
  getRecentErrors: () => request("/admin/recent-errors"),
  getIntegrations: () => request("/integrations"),
  deleteIntegration: (provider: string) => request(`/integrations/${provider}`, { method: "DELETE" }),
};
