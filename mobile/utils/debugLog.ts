const PREFIX = "[AnimalsKingdom]";

type Jsonish = Record<string, unknown> | string | number | boolean | null | undefined;

function formatLine(section: string, message: string, detail?: Jsonish): string {
  if (detail === undefined) return `${PREFIX} ${section} | ${message}`;
  const extra =
    typeof detail === "object" && detail !== null ? JSON.stringify(detail) : String(detail);
  return `${PREFIX} ${section} | ${message} | ${extra}`;
}

/**
 * Dev-only, single-line logs. Paste lines from:
 * - **Metro terminal** (often shows for native / sometimes web), or
 * - **Browser DevTools → Console** when using `expo start --web` (web usually logs there, not Metro).
 * Also keeps a rolling buffer: in DevTools run `globalThis.__AK_DEBUG_DUMP__()` to print all recent lines.
 */
export function debugLog(section: string, message: string, detail?: Jsonish): void {
  if (!__DEV__) return;
  const s = formatLine(section, message, detail);
  console.log(s);
  if (typeof globalThis !== "undefined") {
    const g = globalThis as { __AK_DEBUG_LINES?: string[]; __AK_DEBUG_DUMP__?: () => void };
    g.__AK_DEBUG_LINES = g.__AK_DEBUG_LINES ?? [];
    g.__AK_DEBUG_LINES.push(s);
    if (g.__AK_DEBUG_LINES.length > 120) g.__AK_DEBUG_LINES.shift();
    g.__AK_DEBUG_DUMP__ = () => {
      console.log(g.__AK_DEBUG_LINES?.join("\n") ?? "");
    };
  }
}
