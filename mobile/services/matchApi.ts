import { apiUrl } from "../constants/api";
import { apiFetch, readApiJson } from "../utils/apiFetch";

export type MatchRole = "host" | "guest";

export async function fetchMatchCreate(): Promise<{ code: string; token: string; role: MatchRole }> {
  const res = await apiFetch(apiUrl("/api/match/create"), { method: "POST" });
  const data = await readApiJson<{
    ok?: boolean;
    code?: string;
    token?: string;
    role?: string;
    detail?: unknown;
  }>(res);
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!data.code || !data.token) {
    throw new Error("Invalid response from server");
  }
  return { code: data.code, token: data.token, role: (data.role as MatchRole) || "host" };
}

export async function fetchMatchJoin(rawCode: string): Promise<{ code: string; token: string; role: MatchRole }> {
  const res = await apiFetch(apiUrl("/api/match/join"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: rawCode.trim() }),
  });
  const data = await readApiJson<{
    ok?: boolean;
    code?: string;
    token?: string;
    role?: string;
    detail?: unknown;
  }>(res);
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!data.code || !data.token) {
    throw new Error("Invalid response from server");
  }
  return { code: data.code, token: data.token, role: (data.role as MatchRole) || "guest" };
}
