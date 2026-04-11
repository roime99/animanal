import { apiUrl } from "../constants/api";
import { apiFetch } from "../utils/apiFetch";

/** Must match FastAPI `MATCH_PROTOCOL_VERSION` in `backend/services/match_service.py`. */
export const ONLINE_MATCH_PROTOCOL_EXPECTED = 2;

export type OnlineMatchHealthResult = {
  reachable: boolean;
  protocol: number | null;
};

/** `reachable: true` means HTTP 200 from /health; `protocol` null means the field was absent (old server). */
export async function fetchOnlineMatchHealth(): Promise<OnlineMatchHealthResult> {
  try {
    const res = await apiFetch(apiUrl("/health"));
    if (!res.ok) return { reachable: false, protocol: null };
    const j = (await res.json()) as { online_match_protocol?: unknown };
    const protocol = typeof j.online_match_protocol === "number" ? j.online_match_protocol : null;
    return { reachable: true, protocol };
  } catch {
    return { reachable: false, protocol: null };
  }
}

export function isOnlineMatchBackendCurrent(protocol: number | null): boolean {
  return protocol === ONLINE_MATCH_PROTOCOL_EXPECTED;
}
