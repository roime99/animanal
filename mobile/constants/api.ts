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

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${p}`;
}

/** WebSocket origin matching `getApiBaseUrl()` (http→ws, https→wss). */
export function getWsBaseUrl(): string {
  const raw = getApiBaseUrl();
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
