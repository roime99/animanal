import type { CasePoolAnimal } from "./gameApi";

export type RarityKey = "common" | "uncommon" | "rare" | "epic" | "mythic" | "legendary";

/** Matches backend / client display: 60 / 20 / 14 / 4.5 / 1 / 0.5 */
export function rollCaseRarity(): RarityKey {
  const r = Math.random() * 100;
  if (r < 60) return "common";
  if (r < 80) return "uncommon";
  if (r < 94) return "rare";
  if (r < 98.5) return "epic";
  if (r < 99.5) return "mythic";
  return "legendary";
}

export function filterByRarity(animals: CasePoolAnimal[], rarity: RarityKey): CasePoolAnimal[] {
  return animals.filter((a) => a.rarity === rarity);
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Pick random animal for rolled rarity; fallback to nearest tiers then full pool. */
export function pickAnimalForRarity(animals: CasePoolAnimal[], rarity: RarityKey): CasePoolAnimal {
  const order: RarityKey[] = ["common", "uncommon", "rare", "epic", "mythic", "legendary"];
  let pool = filterByRarity(animals, rarity);
  if (pool.length) return pickRandom(pool);
  const idx = order.indexOf(rarity);
  for (let offset = 1; offset < order.length; offset++) {
    for (const dir of [-1, 1] as const) {
      const j = idx + dir * offset;
      if (j < 0 || j >= order.length) continue;
      pool = filterByRarity(animals, order[j]!);
      if (pool.length) return pickRandom(pool);
    }
  }
  return pickRandom(animals);
}

/** Build strip items for spinner: one fixed winner index, rest random (show correct rarity colors). */
export function buildCaseStrip(pool: CasePoolAnimal[], winner: CasePoolAnimal, length: number, winnerIndex: number): CasePoolAnimal[] {
  const strip: CasePoolAnimal[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winnerIndex) strip.push(winner);
    else strip.push(pickRandom(pool));
  }
  return strip;
}
