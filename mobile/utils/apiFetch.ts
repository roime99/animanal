import { getApiReachabilityHint } from "../constants/api";
import { debugLog } from "./debugLog";

const DEFAULT_TIMEOUT_MS = 45_000;

function bodyLooksLikeHtml(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<head");
}

/**
 * Read fetch body as JSON; if the server returned HTML (wrong host, 404 page, GitHub.io without API), explain clearly.
 */
export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (bodyLooksLikeHtml(text)) {
    throw new Error(
      "The game received a web page (HTML) instead of API data. That usually means EXPO_PUBLIC_API_URL is missing, " +
        "wrong, or points at GitHub Pages instead of your FastAPI server. " +
        "Fix: GitHub repo → Settings → Secrets → EXPO_PUBLIC_API_URL = your API origin (https only if the site is https), " +
        "then Actions → re-run 'Deploy GitHub Pages'. " +
        `(HTTP ${res.status})`
    );
  }
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    const bit = text.split("\n")[0]?.slice(0, 120) ?? "";
    throw new Error(`Invalid JSON from server (HTTP ${res.status}). ${bit}`);
  }
}

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
    const hint = getApiReachabilityHint();
    const withHint = (msg: string) => (hint ? `${msg}\n\n${hint}` : msg);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        withHint(
          `Request timed out (${Math.round(timeoutMs / 1000)}s) to ${url}.\n` +
            "• Phone and PC on the same Wi‑Fi?\n" +
            "• FastAPI running: py -m uvicorn main:app --host 0.0.0.0 --port 8000\n" +
            "• Windows: allow inbound TCP 8000 (Firewall)\n" +
            "• In mobile/.env set EXPO_PUBLIC_API_FOLLOW_METRO=1 so the API host matches Expo (same IP as the QR code)."
        )
      );
    }
    if (e instanceof Error) {
      throw new Error(withHint(e.message));
    }
    throw new Error(withHint(String(e)));
  } finally {
    clearTimeout(timer);
  }
}
