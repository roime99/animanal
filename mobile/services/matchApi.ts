import { apiUrl } from "../constants/api";
import { apiFetch } from "../utils/apiFetch";

export type MatchRole = "host" | "guest";

export type OpenMatchRow = {
  code: string;
  entry_cost: number;
  has_password: boolean;
};

export type MatchCreateOptions = {
  /** Default 50 on server. */
  entry_cost?: number;
  /** Empty or omitted = anyone can join. */
  password?: string | null;
};

export async function fetchMatchCreate(opts?: MatchCreateOptions): Promise<{
  code: string;
  token: string;
  role: MatchRole;
  entry_cost: number;
}> {
  const res = await apiFetch(apiUrl("/api/match/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry_cost: opts?.entry_cost ?? 50,
      password: opts?.password?.trim() || null,
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    code?: string;
    token?: string;
    role?: string;
    entry_cost?: number;
    detail?: unknown;
  };
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!data.code || !data.token) {
    throw new Error("Invalid response from server");
  }
  return {
    code: data.code,
    token: data.token,
    role: (data.role as MatchRole) || "host",
    entry_cost: typeof data.entry_cost === "number" ? data.entry_cost : 50,
  };
}

export async function fetchMatchJoin(
  rawCode: string,
  password?: string | null
): Promise<{ code: string; token: string; role: MatchRole; entry_cost: number }> {
  const res = await apiFetch(apiUrl("/api/match/join"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: rawCode.trim(),
      password: password?.trim() ? password.trim() : null,
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    code?: string;
    token?: string;
    role?: string;
    entry_cost?: number;
    detail?: unknown;
  };
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!data.code || !data.token) {
    throw new Error("Invalid response from server");
  }
  return {
    code: data.code,
    token: data.token,
    role: (data.role as MatchRole) || "guest",
    entry_cost: typeof data.entry_cost === "number" ? data.entry_cost : 50,
  };
}

export async function fetchMatchLookup(rawCode: string): Promise<{
  code: string;
  entry_cost: number;
  has_password: boolean;
}> {
  const q = encodeURIComponent(rawCode.trim());
  const res = await apiFetch(apiUrl(`/api/match/lookup?code=${q}`));
  const data = (await res.json()) as {
    code?: string;
    entry_cost?: number;
    has_password?: boolean;
    detail?: unknown;
  };
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!data.code || typeof data.entry_cost !== "number") {
    throw new Error("Invalid response from server");
  }
  return {
    code: data.code,
    entry_cost: data.entry_cost,
    has_password: !!data.has_password,
  };
}

export async function fetchMatchOpenList(): Promise<OpenMatchRow[]> {
  const res = await apiFetch(apiUrl("/api/match/open"));
  const data = (await res.json()) as { open?: OpenMatchRow[]; detail?: unknown };
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return Array.isArray(data.open) ? data.open : [];
}
