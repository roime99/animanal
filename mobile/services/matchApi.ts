import { apiUrl } from "../constants/api";
import { apiFetch } from "../utils/apiFetch";

export type MatchRole = "host" | "guest";

export type OpenMatchRow = {
  code: string;
  entry_cost: number;
  has_password: boolean;
  max_players: number;
  players_joined: number;
  host_display_name: string;
  lobby_title: string;
};

export type MatchCreateOptions = {
  /** Default 50 on server. */
  entry_cost?: number;
  /** Empty or omitted = anyone can join. */
  password?: string | null;
  host_username_norm?: string | null;
  host_display_name?: string | null;
  /** Total players in the match (2–6). */
  max_players?: number;
};

export async function fetchMatchCreate(opts?: MatchCreateOptions): Promise<{
  code: string;
  token: string;
  role: MatchRole;
  entry_cost: number;
  max_players: number;
}> {
  const res = await apiFetch(apiUrl("/api/match/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry_cost: opts?.entry_cost ?? 50,
      password: opts?.password?.trim() || null,
      host_username_norm: opts?.host_username_norm?.trim() || null,
      host_display_name: opts?.host_display_name?.trim() || null,
      max_players: opts?.max_players ?? 2,
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
    max_players: typeof (data as { max_players?: number }).max_players === "number" ? (data as { max_players: number }).max_players : 2,
  };
}

export async function fetchMatchJoin(
  rawCode: string,
  password?: string | null,
  guestIdentity?: { guest_username_norm?: string | null; guest_display_name?: string | null }
): Promise<{ code: string; token: string; role: MatchRole; entry_cost: number; max_players: number }> {
  const res = await apiFetch(apiUrl("/api/match/join"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: rawCode.trim(),
      password: password?.trim() ? password.trim() : null,
      guest_username_norm: guestIdentity?.guest_username_norm?.trim() || null,
      guest_display_name: guestIdentity?.guest_display_name?.trim() || null,
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
    max_players: typeof (data as { max_players?: number }).max_players === "number" ? (data as { max_players: number }).max_players : 2,
  };
}

export async function fetchMatchLookup(rawCode: string): Promise<{
  code: string;
  entry_cost: number;
  has_password: boolean;
  max_players?: number;
  players_joined?: number;
  lobby_title?: string;
}> {
  const q = encodeURIComponent(rawCode.trim());
  const res = await apiFetch(apiUrl(`/api/match/lookup?code=${q}`));
  const data = (await res.json()) as {
    code?: string;
    entry_cost?: number;
    has_password?: boolean;
    max_players?: number;
    players_joined?: number;
    lobby_title?: string;
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
    max_players: typeof data.max_players === "number" ? data.max_players : undefined,
    players_joined: typeof data.players_joined === "number" ? data.players_joined : undefined,
    lobby_title: typeof data.lobby_title === "string" ? data.lobby_title : undefined,
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
