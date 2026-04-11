/** Lower = higher tier (for sorting inventory: legendary first). */
export function raritySortRank(rarity: string): number {
  const order = ["legendary", "mythic", "epic", "rare", "uncommon", "common"];
  const i = order.indexOf(rarity.trim().toLowerCase());
  return i === -1 ? 999 : i;
}

/** Visual tier colors aligned with backend rarity strings. */
export function rarityBorderColor(rarity: string): string {
  switch (rarity) {
    case "common":
      return "#9e9e9e";
    case "uncommon":
      return "#4fc3f7";
    case "rare":
      return "#1565c0";
    case "epic":
      return "#ab47bc";
    case "mythic":
      return "#ef5350";
    case "legendary":
      return "#ffd54f";
    default:
      return "#bdbdbd";
  }
}

export function rarityGlowColor(rarity: string): string {
  switch (rarity) {
    case "common":
      return "rgba(158,158,158,0.45)";
    case "uncommon":
      return "rgba(79,195,247,0.5)";
    case "rare":
      return "rgba(21,101,192,0.5)";
    case "epic":
      return "rgba(171,71,188,0.55)";
    case "mythic":
      return "rgba(239,83,80,0.55)";
    case "legendary":
      return "rgba(255,213,79,0.65)";
    default:
      return "rgba(0,0,0,0.2)";
  }
}

/** Soft panel fill for case reveal / highlights. */
export function rarityRevealTint(rarity: string): string {
  switch (rarity) {
    case "common":
      return "rgba(158,158,158,0.2)";
    case "uncommon":
      return "rgba(79,195,247,0.2)";
    case "rare":
      return "rgba(21,101,192,0.22)";
    case "epic":
      return "rgba(171,71,188,0.22)";
    case "mythic":
      return "rgba(239,83,80,0.22)";
    case "legendary":
      return "rgba(255,213,79,0.28)";
    default:
      return "rgba(189,189,189,0.18)";
  }
}
