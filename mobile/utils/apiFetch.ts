import { debugLog } from "./debugLog";

const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Fetch with a bounded wait; surfaces a clearer message when the phone cannot reach the PC API.
 */
export async function apiFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _t, ...rest } = init ?? {};
  if (__DEV__ && url.includes("/api/game/start")) {
    try {
      const u = new URL(url);
      debugLog("apiFetch", "request /api/game/start", {
        origin: u.origin,
        search: u.search,
        method: (rest.method as string) || "GET",
      });
    } catch {
      debugLog("apiFetch", "request /api/game/start (unparsed url)", { url });
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Request timed out (${Math.round(timeoutMs / 1000)}s) to ${url}.\n` +
          "• Phone and PC on the same Wi‑Fi?\n" +
          "• FastAPI running: py -m uvicorn main:app --host 0.0.0.0 --port 8000\n" +
          "• Windows: allow inbound TCP 8000 (Firewall)\n" +
          "• In mobile/.env set EXPO_PUBLIC_API_FOLLOW_METRO=1 so the API host matches Expo (same IP as the QR code)."
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
