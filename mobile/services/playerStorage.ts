import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAYERS_KEY = "animal_trivia_embed_players_v1";
const LAST_USER_KEY = "animal_trivia_embed_last_user_v1";
/** One-time grant flag (AsyncStorage). */
const ROI_BOI_GRANT_KEY = "animal_trivia_embed_roi_boi_million_v1";
/** Normalized username that receives the grant (`Roi_Boi` → `roi_boi`). */
export const ROI_BOI_NORM = "roi_boi";
const ROI_BOI_GOLDEN_COINS = 1_000_000;

/** Cost in golden coins for the single available case type. */
export const CASE_OPEN_COST = 100;

/** Charged when an online 1v1 match starts (first round). Practice vs bot is free. */
export const ONLINE_MATCH_ENTRY_COST = 50;
export const ONLINE_MATCH_WIN_REWARD = 100;

export type InventoryEntry = {
  id: number;
  animalName: string;
  difficulty: number;
  rarity: string;
  imageUrl: string;
  unboxedAt: string;
};

export type PlayerStats = {
  displayName: string;
  endlessHiScore: number;
  gamesPlayed: number;
  totalCorrect: number;
  totalWrong: number;
  totalAnswered: number;
  /** Golden coins (currency). Older saves may omit this field. */
  goldenCoins?: number;
  /** Unboxed animals from cases. Older saves may omit this field. */
  inventory?: InventoryEntry[];
  lastPlayedAt: string;
};

type PlayersMap = Record<string, PlayerStats>;

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function defaultStats(displayName: string): PlayerStats {
  return {
    displayName,
    endlessHiScore: 0,
    gamesPlayed: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalAnswered: 0,
    goldenCoins: 0,
    inventory: [],
    lastPlayedAt: new Date().toISOString(),
  };
}

export type PlayerStatsNormalized = Omit<PlayerStats, "goldenCoins" | "inventory"> & {
  goldenCoins: number;
  inventory: InventoryEntry[];
};

function withDefaults(p: PlayerStats): PlayerStatsNormalized {
  return {
    ...p,
    goldenCoins: p.goldenCoins ?? 0,
    inventory: Array.isArray(p.inventory) ? p.inventory : [],
  };
}

async function loadMap(): Promise<PlayersMap> {
  const raw = await AsyncStorage.getItem(PLAYERS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PlayersMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMap(map: PlayersMap): Promise<void> {
  await AsyncStorage.setItem(PLAYERS_KEY, JSON.stringify(map));
}

/** One-time: ensure `roi_boi` has at least 1,000,000 golden coins. */
async function maybeGrantRoiBoiMillion(norm: string): Promise<void> {
  if (norm !== ROI_BOI_NORM) return;
  const done = await AsyncStorage.getItem(ROI_BOI_GRANT_KEY);
  if (done === "1") return;
  const map = await loadMap();
  const p = map[norm];
  if (!p) return;
  const s = withDefaults(p);
  s.goldenCoins = Math.max(s.goldenCoins, ROI_BOI_GOLDEN_COINS);
  map[norm] = s;
  await saveMap(map);
  await AsyncStorage.setItem(ROI_BOI_GRANT_KEY, "1");
}

export async function getLastUsernameNorm(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_USER_KEY);
}

export async function setLastUsernameNorm(norm: string): Promise<void> {
  await AsyncStorage.setItem(LAST_USER_KEY, norm);
}

export async function clearLastUsername(): Promise<void> {
  await AsyncStorage.removeItem(LAST_USER_KEY);
}

export async function getPlayer(norm: string): Promise<PlayerStatsNormalized | null> {
  await maybeGrantRoiBoiMillion(norm);
  const map = await loadMap();
  const p = map[norm];
  if (!p) return null;
  return withDefaults(p);
}

/**
 * One username per normalized name (case-insensitive). Creates a new profile if missing.
 */
export async function loginOrCreate(
  rawUsername: string
): Promise<{ ok: true; norm: string; stats: PlayerStatsNormalized } | { ok: false; error: string }> {
  const trimmed = rawUsername.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a username." };
  }
  if (trimmed.length > 32) {
    return { ok: false, error: "Username must be 32 characters or less." };
  }
  const norm = normalizeUsername(trimmed);
  const map = await loadMap();
  if (map[norm]) {
    await setLastUsernameNorm(norm);
    let s = map[norm];
    const needsMigrate = s.goldenCoins == null || !Array.isArray(s.inventory);
    if (needsMigrate) {
      s = withDefaults(s);
      map[norm] = s;
      await saveMap(map);
    }
    await maybeGrantRoiBoiMillion(norm);
    const mapAfter = await loadMap();
    const final = mapAfter[norm];
    return { ok: true, norm, stats: withDefaults(final!) };
  }
  const stats = defaultStats(trimmed);
  map[norm] = stats;
  await saveMap(map);
  await setLastUsernameNorm(norm);
  await maybeGrantRoiBoiMillion(norm);
  const mapAfter = await loadMap();
  return { ok: true, norm, stats: withDefaults(mapAfter[norm]!) };
}

export async function recordEndlessGame(
  norm: string,
  sessionScore: number,
  sessionWrong: number
): Promise<PlayerStatsNormalized> {
  const map = await loadMap();
  const existing = map[norm];
  if (!existing) {
    throw new Error("Unknown player");
  }
  const answered = sessionScore + sessionWrong;
  const next: PlayerStatsNormalized = {
    ...withDefaults(existing),
    endlessHiScore: Math.max(existing.endlessHiScore, sessionScore),
    gamesPlayed: existing.gamesPlayed + 1,
    totalCorrect: existing.totalCorrect + sessionScore,
    totalWrong: existing.totalWrong + sessionWrong,
    totalAnswered: existing.totalAnswered + answered,
    lastPlayedAt: new Date().toISOString(),
  };
  map[norm] = next;
  await saveMap(map);
  return next;
}

export async function addGoldenCoins(norm: string, amount: number): Promise<PlayerStatsNormalized> {
  if (amount <= 0) {
    const map = await loadMap();
    const existing = map[norm];
    if (!existing) throw new Error("Unknown player");
    return withDefaults(existing);
  }
  const map = await loadMap();
  const existing = map[norm];
  if (!existing) {
    throw new Error("Unknown player");
  }
  const base = withDefaults(existing);
  const next: PlayerStatsNormalized = {
    ...base,
    goldenCoins: base.goldenCoins + amount,
    lastPlayedAt: new Date().toISOString(),
  };
  map[norm] = next;
  await saveMap(map);
  return next;
}

/**
 * Spend case cost and append one inventory entry atomically.
 */
export async function openCaseAndRecord(
  norm: string,
  entry: Omit<InventoryEntry, "unboxedAt">
): Promise<PlayerStatsNormalized> {
  const map = await loadMap();
  const existing = map[norm];
  if (!existing) {
    throw new Error("Unknown player");
  }
  const base = withDefaults(existing);
  if (base.goldenCoins < CASE_OPEN_COST) {
    throw new Error("Not enough golden coins.");
  }
  const inv = [...base.inventory, { ...entry, unboxedAt: new Date().toISOString() }];
  const next: PlayerStatsNormalized = {
    ...base,
    goldenCoins: base.goldenCoins - CASE_OPEN_COST,
    inventory: inv,
    lastPlayedAt: new Date().toISOString(),
  };
  map[norm] = next;
  await saveMap(map);
  return next;
}

export async function chargeOnlineMatchEntry(norm: string): Promise<PlayerStatsNormalized> {
  const map = await loadMap();
  const existing = map[norm];
  if (!existing) {
    throw new Error("Unknown player");
  }
  const base = withDefaults(existing);
  if (base.goldenCoins < ONLINE_MATCH_ENTRY_COST) {
    throw new Error(`Need ${ONLINE_MATCH_ENTRY_COST} golden coins to play online 1v1.`);
  }
  const next: PlayerStatsNormalized = {
    ...base,
    goldenCoins: base.goldenCoins - ONLINE_MATCH_ENTRY_COST,
    lastPlayedAt: new Date().toISOString(),
  };
  map[norm] = next;
  await saveMap(map);
  return next;
}

/** Loser gets no refund (entry already spent). Winner receives ONLINE_MATCH_WIN_REWARD. */
export async function applyOnlineMatchPayout(norm: string, won: boolean): Promise<PlayerStatsNormalized> {
  if (!won) {
    const map = await loadMap();
    const existing = map[norm];
    if (!existing) {
      throw new Error("Unknown player");
    }
    const base = withDefaults(existing);
    const next: PlayerStatsNormalized = {
      ...base,
      lastPlayedAt: new Date().toISOString(),
    };
    map[norm] = next;
    await saveMap(map);
    return next;
  }
  return addGoldenCoins(norm, ONLINE_MATCH_WIN_REWARD);
}
