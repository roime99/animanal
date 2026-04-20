import { apiUrl, getApiBaseUrl } from "../constants/api";
import { apiFetch } from "../utils/apiFetch";
import { debugLog } from "../utils/debugLog";

export type DifficultyKey = "easy" | "medium" | "hard";
export type LevelNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type GameQuestion = {
  id: number;
  image_url: string;
  /** When embed_mode: Commons-style `<a><img></a>` from server (use on web). */
  image_embed_html?: string | null;
  options: string[];
  correct_answer: string;
  fun_fact: string;
  /** Present on game API JSON; used for case pool fallback. */
  animal_name?: string;
  difficulty?: number;
  /** Taxonomy path when server sends it (useful for debugging group modes). */
  hierarchy?: string;
};

export type GameStartResponse = {
  ok: boolean;
  level: number;
  difficulty_label: string;
  question_count: number;
  questions: GameQuestion[];
  hierarchy_mode?: string | null;
  embed_mode?: boolean;
};

export type FetchGameStartOptions = {
  /** Correct animal names already used this endless run — server excludes them from the deck. */
  excludeAnimalNames?: string[];
  /**
   * Server filters by substring in `hierarchy` (case-insensitive).
   * Allowed: birds, amphibians, arthropods, fish, mammals, carnivora, reptiles.
   */
  hierarchyMode?: string;
  /** Wikimedia URLs only; server adds `image_embed_html` for web. */
  embedMode?: boolean;
};

export async function fetchGameStart(
  difficulty: DifficultyKey,
  options?: FetchGameStartOptions
): Promise<GameStartResponse> {
  const params = new URLSearchParams();
  params.set("difficulty", difficulty);
  const ex = options?.excludeAnimalNames ?? [];
  for (const name of ex) {
    const t = name.trim();
    if (t) params.append("exclude_animal_names", t);
  }
  const hm = options?.hierarchyMode?.trim().toLowerCase();
  if (hm) params.set("hierarchy_mode", hm);
  if (options?.embedMode) params.set("embed_mode", "true");
  const url = `${apiUrl("/api/game/start")}?${params.toString()}`;
  debugLog("gameApi", "fetchGameStart", {
    apiBase: getApiBaseUrl(),
    difficulty,
    hierarchyMode: hm ?? null,
    embedMode: Boolean(options?.embedMode),
    excludeAnimalNames: ex.length,
  });
  const res = await apiFetch(url);
  const data = (await res.json()) as GameStartResponse & { detail?: string | unknown };

  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }

  if (!data.ok || !data.questions?.length) {
    throw new Error("Invalid response from server");
  }

  const q0 = data.questions[0];
  debugLog("gameApi", "fetchGameStart OK", {
    status: res.status,
    hierarchy_mode: data.hierarchy_mode ?? null,
    questionCount: data.questions.length,
    q0_id: q0?.id,
    q0_correct: q0?.correct_answer,
    q0_hierarchy: q0?.hierarchy ?? null,
    q0_options: q0?.options,
  });

  return data;
}

export function difficultyForLevel(level: LevelNumber): DifficultyKey {
  if (level <= 3) return "easy";
  if (level <= 6) return "medium";
  return "hard";
}

/** Encode each path segment so spaces, parentheses, etc. work in browsers (CSS url() and <img src>). */
function encodeUrlPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const encoded =
    "/" +
    normalized
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  return encoded;
}

export type CasePoolAnimal = {
  id: number;
  animal_name: string;
  difficulty: number;
  image_url: string;
  rarity: string;
  image_embed_html?: string | null;
};

export type CasePoolResponse = {
  animals: CasePoolAnimal[];
};

/** Full card data from `GET /api/animals/{id}` (inventory detail). */
export type AnimalDetail = {
  id: number;
  animal_name: string;
  animal_family: string;
  fun_fact: string;
  image_url: string;
  image_embed_html?: string | null;
};

export async function fetchAnimalDetail(animalId: number): Promise<AnimalDetail> {
  const res = await apiFetch(apiUrl(`/api/animals/${animalId}`));
  const data = (await res.json()) as AnimalDetail & { detail?: unknown };
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (typeof data.id !== "number" || typeof data.animal_name !== "string") {
    throw new Error("Invalid response from server");
  }
  return data;
}

/** Same tier bands as FastAPI `_rarity_for_difficulty` (case pool + fallback). */
function rarityForDifficulty(d: number): string {
  if (d <= 2) return "common";
  if (d <= 4) return "uncommon";
  if (d <= 6) return "rare";
  if (d <= 8) return "epic";
  if (d === 9) return "mythic";
  return "legendary";
}

async function readJsonIfPresent<T>(res: Response): Promise<T | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * When `GET /api/case/pool` is missing (404) or empty, merge animals from several
 * `/api/game/start` batches — same server, no extra backend route required.
 */
async function fetchCasePoolViaGameStarts(embedMode?: boolean): Promise<CasePoolAnimal[]> {
  const difficulties: DifficultyKey[] = ["easy", "medium", "hard"];
  const settled = await Promise.allSettled(
    difficulties.map((d) => fetchGameStart(d, { embedMode }))
  );
  const byId = new Map<number, CasePoolAnimal>();

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const q of result.value.questions) {
      const d = q.difficulty;
      if (typeof d !== "number" || d < 1 || d > 10) continue;
      const name = (q.animal_name || q.correct_answer || "").trim();
      if (!name || !q.image_url?.trim()) continue;
      byId.set(q.id, {
        id: q.id,
        animal_name: name,
        difficulty: d,
        image_url: q.image_url,
        rarity: rarityForDifficulty(d),
        image_embed_html: q.image_embed_html ?? undefined,
      });
    }
  }

  const animals = [...byId.values()];
  if (!animals.length) {
    const firstErr = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    const msg =
      firstErr?.reason instanceof Error ? firstErr.reason.message : "Game API did not return usable animals.";
    throw new Error(msg);
  }
  return animals;
}

export async function fetchCasePool(options?: { embedMode?: boolean }): Promise<CasePoolAnimal[]> {
  const q = new URLSearchParams();
  if (options?.embedMode) q.set("embed_mode", "true");
  const qs = q.toString();
  const url = `${apiUrl("/api/case/pool")}${qs ? `?${qs}` : ""}`;
  const res = await apiFetch(url);
  const data = await readJsonIfPresent<CasePoolResponse & { detail?: string | unknown }>(res);

  if (res.ok && data?.animals?.length) {
    return data.animals;
  }

  const tryFallback =
    res.status === 404 ||
    res.status === 503 ||
    (res.ok && (!data?.animals || data.animals.length === 0));

  if (tryFallback) {
    try {
      return await fetchCasePoolViaGameStarts(options?.embedMode);
    } catch (e) {
      const hint =
        res.status === 404
          ? " Case pool URL was not found — is FastAPI running from the latest `backend/main.py` on port 8000?"
          : "";
      const extra = e instanceof Error ? e.message : String(e);
      throw new Error(`${extra}${hint}`);
    }
  }

  const detail =
    data && typeof data.detail === "string"
      ? data.detail
      : JSON.stringify(data?.detail ?? res.statusText);
  throw new Error(detail || `HTTP ${res.status}`);
}

export function fullImageUrl(relativePath: string): string {
  // Absolute URLs (e.g. Wikimedia from API) must be used as-is — do not re-encode path segments.
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  const path = encodeUrlPath(relativePath);
  return `${getApiBaseUrl()}${path}`;
}
