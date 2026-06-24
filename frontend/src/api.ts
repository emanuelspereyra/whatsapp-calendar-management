const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export type ReadinessResponse = {
  status: "ok" | "degraded" | "down";
  services: Record<string, string>;
};

export type ConversationRecord = {
  id: string;
  clientId: string;
  status: string;
  lastIntent: string | null;
  proposedDate: string | null;
  proposedTime: string | null;
  proposedDurationMinutes: number | null;
  proposedTopic: string | null;
  suggestedReply: string | null;
  lastError: string | null;
  approvedByUserId?: string | null;
  rejectedByUserId?: string | null;
  client?: { id: string; phone: string; name: string | null };
  approvedBy?: { id: string; username: string } | null;
  rejectedBy?: { id: string; username: string } | null;
};

export type ConversationListResponse = {
  data: ConversationRecord[];
  pagination: { skip: number; take: number; total: number };
};

export type CalendarEventRecord = {
  id: string;
  conversationId: string;
  googleEventId: string | null;
  title: string;
  startDateTime: string;
  endDateTime: string;
  status: string;
  createdAt: string;
  calendarLink: string | null;
  client?: { id: string; phone: string; name: string | null };
};

export type ProcessingResult = {
  conversationId?: string;
  status?: string;
  calendarEventCreated?: boolean;
  suggestedReply?: string;
};

class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    if (response.status === 401) onUnauthorized?.();
    throw new ApiError(body.error ?? "Request failed", response.status);
  }
  return response.json();
}

export type AuthResult = { token: string; userId: string; username: string; role: string };

export type UserSummary = { id: string; username: string; role: string; createdAt: string };

export async function login(username: string, password: string): Promise<AuthResult> {
  return publicPost("/auth/login", { username, password });
}

export async function register(username: string, password: string, code?: string): Promise<AuthResult> {
  return publicPost("/auth/register", { username, password, code: code || undefined });
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(data.error ?? "Request failed", response.status);
  }
  return response.json();
}

export function fetchHealth(): Promise<{ status: string; uptime: number; timestamp: string }> {
  return fetch(`${BASE_URL}/health`).then((res) => res.json());
}

export function fetchReadiness(token: string): Promise<ReadinessResponse> {
  return request("/admin/healthcheck/run", token, { method: "POST" });
}

export function fetchConversations(
  token: string,
  params: { status?: string; skip?: number; take?: number } = {}
): Promise<ConversationListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.skip !== undefined) query.set("skip", String(params.skip));
  if (params.take !== undefined) query.set("take", String(params.take));
  const qs = query.toString();
  return request(`/admin/conversations${qs ? `?${qs}` : ""}`, token);
}

export function fetchCalendarEvents(
  token: string,
  limit = 10
): Promise<{ data: CalendarEventRecord[] }> {
  return request(`/admin/calendar-events?limit=${limit}`, token);
}

export function approveConversation(token: string, id: string): Promise<ProcessingResult> {
  return request(`/admin/conversations/${id}/approve`, token, { method: "POST" });
}

export function rejectConversation(token: string, id: string): Promise<ProcessingResult> {
  return request(`/admin/conversations/${id}/reject`, token, { method: "POST" });
}

export function fetchUsers(token: string): Promise<{ data: UserSummary[] }> {
  return request("/admin/users", token);
}

export function updateUserRole(token: string, id: string, role: "admin" | "viewer"): Promise<UserSummary> {
  return request(`/admin/users/${id}/role`, token, {
    method: "PATCH",
    body: JSON.stringify({ role })
  });
}

export function revokeUser(token: string, id: string): Promise<{ revoked: boolean }> {
  return request(`/admin/users/${id}/revoke`, token, { method: "POST" });
}

export { ApiError };
