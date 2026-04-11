import { apiUrl } from "../constants/api";

const MGMT_USER_HEADER = "X-Animals-Kingdom-Dev-User";

export type MgmtLogLine = { seq: number; level: string; text: string };

export type MgmtLogsResponse = {
  lines: MgmtLogLine[];
  max_seq: number;
};

export type MgmtStatusResponse = {
  ok: boolean;
  db_exists: boolean;
  db_path: string;
  images_dir: string;
  images_dir_exists: boolean;
  python_exe: string;
  repo_root: string;
  backend_dir: string;
  mobile_dir: string;
  npx_path: string | null;
};

export type MgmtCommandsResponse = {
  title: string;
  steps: { name: string; cwd: string | null; command: string }[];
  env_mobile: string;
};

export type VerifyHierarchyResult = {
  ok: boolean;
  mode: string;
  checks: Record<string, unknown>[];
  error: string | null;
};

function mergeHeaders(norm: string, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set(MGMT_USER_HEADER, norm);
  return h;
}

async function readMgmtResponse<T>(r: Response): Promise<T> {
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!r.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : text;
    throw new Error(`${r.status} ${detail || r.statusText}`.trim());
  }
  return body as T;
}

/** No header — use to see if the running API includes the mgmt router (avoids mistaking old servers for auth bugs). */
export async function fetchMgmtPublicInfo(): Promise<{ mgmt: string }> {
  const r = await fetch(apiUrl("/api/mgmt/public-info"));
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!r.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : text;
    throw new Error(`${r.status} ${detail || r.statusText}`.trim());
  }
  return body as { mgmt: string };
}

export async function fetchMgmtLogs(
  after: number,
  limit: number,
  norm: string
): Promise<MgmtLogsResponse> {
  const q = new URLSearchParams({ after: String(after), limit: String(limit) });
  const r = await fetch(apiUrl(`/api/mgmt/logs?${q}`), {
    headers: mergeHeaders(norm),
  });
  return readMgmtResponse<MgmtLogsResponse>(r);
}

export async function fetchMgmtStatus(norm: string): Promise<MgmtStatusResponse> {
  const r = await fetch(apiUrl("/api/mgmt/status"), { headers: mergeHeaders(norm) });
  return readMgmtResponse<MgmtStatusResponse>(r);
}

export async function fetchMgmtCommands(norm: string): Promise<MgmtCommandsResponse> {
  const r = await fetch(apiUrl("/api/mgmt/commands"), { headers: mergeHeaders(norm) });
  return readMgmtResponse<MgmtCommandsResponse>(r);
}

export async function postMgmtPing(norm: string): Promise<{ status: string }> {
  const r = await fetch(apiUrl("/api/mgmt/ping"), {
    method: "POST",
    headers: mergeHeaders(norm),
  });
  return readMgmtResponse<{ status: string }>(r);
}

export async function postVerifyHierarchy(
  norm: string,
  mode: string
): Promise<VerifyHierarchyResult> {
  const r = await fetch(apiUrl("/api/mgmt/verify-hierarchy"), {
    method: "POST",
    headers: mergeHeaders(norm, { "Content-Type": "application/json" }),
    body: JSON.stringify({ mode }),
  });
  return readMgmtResponse<VerifyHierarchyResult>(r);
}

export async function postMgmtSpawn(
  norm: string,
  kind: "expo_web" | "uvicorn_secondary"
): Promise<{ ok: boolean; pid?: number; note?: string }> {
  const r = await fetch(apiUrl("/api/mgmt/spawn"), {
    method: "POST",
    headers: mergeHeaders(norm, { "Content-Type": "application/json" }),
    body: JSON.stringify({ kind }),
  });
  return readMgmtResponse(r);
}
