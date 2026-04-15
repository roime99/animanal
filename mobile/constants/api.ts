/**
 * Base URL for the FastAPI game server (no trailing slash).
 *
 * Physical device: set EXPO_PUBLIC_API_FOLLOW_METRO=1 in `.env` so the API host is always the
 * same LAN address as the Metro bundler (the one shown in `npx expo start` / the QR code).
 * That avoids timeouts when your PC gets a new DHCP IP but `.env` still has the old one.
 *
 * Or set EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000 explicitly.
 * Android emulator: http://10.0.2.2:8000
 *
 * On web, when the page is `http://localhost:…` but the API URL uses `127.0.0.1` (or the reverse),
 * we align the hostname with `window.location.hostname` so `<img>` and fetch stay on the same
 * loopback host (some embedded browsers block cross-host loopback loads).
 */
import Constants from "expo-constants";
import { getExpoGoProjectConfig } from "expo";
import { Platform } from "react-native";

const ENV_API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const FOLLOW_METRO = process.env.EXPO_PUBLIC_API_FOLLOW_METRO === "1";

function defaultLoopbackBase(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    // GitHub Pages has no API on :8000 — require EXPO_PUBLIC_API_URL at build time.
    if (h.endsWith("github.io")) {
      return ENV_API_BASE || "";
    }
    return `http://${h}:8000`;
  }
  return "http://127.0.0.1:8000";
}

/** LAN hostname of the machine running Metro (Expo), e.g. 192.168.1.12 — not the API port. */
export function getPackagerLanHost(): string | null {
  const candidates: (string | undefined | null)[] = [
    getExpoGoProjectConfig()?.debuggerHost,
    Constants.expoConfig?.hostUri,
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost,
  ];
  const m2 = Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | undefined;
  candidates.push(m2?.extra?.expoClient?.hostUri);

  for (const c of candidates) {
    if (!c || typeof c !== "string") continue;
    const host = c.split(":")[0]?.trim() ?? "";
    if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  }
  return null;
}

function apiBaseFromMetro(): string | null {
  const h = getPackagerLanHost();
  return h ? `http://${h}:8000` : null;
}

function alignLoopbackHostnameWithPage(base: string): string {
  if (typeof window === "undefined") return base;
  const pageHost = window.location?.hostname;
  if (!pageHost) return base;
  try {
    const u = new URL(base);
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.hostname !== pageHost) {
      u.hostname = pageHost;
      return u.origin;
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function getApiBaseUrl(): string {
  if (FOLLOW_METRO && Platform.OS !== "web") {
    const fromMetro = apiBaseFromMetro();
    if (fromMetro) return fromMetro;
  }

  let raw = ENV_API_BASE || defaultLoopbackBase();

  if (Platform.OS !== "web") {
    try {
      const u = new URL(raw);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        const fromMetro = apiBaseFromMetro();
        if (fromMetro) raw = fromMetro;
      }
    } catch {
      /* ignore */
    }
  }

  return alignLoopbackHostnameWithPage(raw);
}

/** True for addresses only reachable on the same LAN as the server (not from mobile data). */
function isRfc1918OrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (!h || h === "localhost") return true;
  if (h === "127.0.0.1" || h === "0.0.0.0") return true;
  if (h.endsWith(".local")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

/**
 * When the bundled API URL cannot work off home Wi‑Fi (mobile data) or from HTTPS pages (mixed content).
 * Use on the home screen and after failed fetches.
 */
export function getApiReachabilityHint(): string | null {
  const base = getApiBaseUrl().replace(/\/$/, "");
  if (!base) return null;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }

  const isWeb = Platform.OS === "web";
  const pageSecure = typeof window !== "undefined" && window.location?.protocol === "https:";
  const onGithubPages =
    typeof window !== "undefined" &&
    Boolean(window.location?.hostname?.toLowerCase().endsWith("github.io"));

  if (isWeb && pageSecure && u.protocol === "http:") {
    return (
      "This page is HTTPS but the game API is HTTP — the browser blocks that, and mobile data cannot reach a home PC anyway. " +
      "Use a public HTTPS API: set the EXPO_PUBLIC_API_URL GitHub Actions secret and redeploy Pages."
    );
  }

  if (isRfc1918OrLocalHostname(u.hostname)) {
    if (onGithubPages || (isWeb && pageSecure)) {
      return (
        "The game server is on a private home/work network — it only works on the same Wi‑Fi as that computer. " +
        "On mobile data, host the API on the internet (HTTPS) and set EXPO_PUBLIC_API_URL, then redeploy."
      );
    }
    if (!isWeb) {
      return (
        "This app points at a computer on your local network. Use Wi‑Fi, or set EXPO_PUBLIC_API_URL to a public HTTPS API and rebuild."
      );
    }
  }

  return null;
}

const MISSING_API_BASE_MSG =
  "Game API URL is not configured. On GitHub Pages: Repository Settings → Secrets and variables → Actions → " +
  "add EXPO_PUBLIC_API_URL with your public FastAPI base (e.g. https://your-app.onrender.com, no trailing slash). " +
  "Then re-run the 'Deploy GitHub Pages' workflow. " +
  "Locally: set EXPO_PUBLIC_API_URL in mobile/.env.";

/** Use when a request or asset must hit the API (avoids silent relative URLs on GitHub Pages). */
export function assertApiBaseConfigured(): string {
  const base = getApiBaseUrl().replace(/\/$/, "");
  if (!base) throw new Error(MISSING_API_BASE_MSG);
  return base;
}

export function apiUrl(path: string): string {
  const base = assertApiBaseConfigured();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** WebSocket origin matching `getApiBaseUrl()` (http→ws, https→wss). */
export function getWsBaseUrl(): string {
  const raw = assertApiBaseConfigured();
  try {
    const u = new URL(raw);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.origin;
  } catch {
    return raw.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  }
}

export function wsUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getWsBaseUrl()}${p}`;
}
