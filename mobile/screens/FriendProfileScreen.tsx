import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FadeSlideIn } from "../components/FadeSlideIn";
import { InventoryAnimalDetailModal } from "../components/InventoryAnimalDetailModal";
import { ScalePress } from "../components/ScalePress";
import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { APP_FONT_FAMILY } from "../constants/typography";
import { fullImageUrl } from "../services/gameApi";
import { fetchPublicProfile, type PublicProfileResponse } from "../services/socialApi";
import type { InventoryEntry } from "../services/playerStorage";
import { rarityBorderColor, raritySortRank } from "../utils/rarityTheme";

type Props = {
  friendNorm: string;
  onBack: () => void;
};

function invFromProfile(p: Record<string, unknown>): InventoryEntry[] {
  const raw = p.inventory;
  if (!Array.isArray(raw)) return [];
  const out: InventoryEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "number" || typeof o.animalName !== "string") continue;
    out.push({
      id: o.id,
      animalName: o.animalName,
      difficulty: typeof o.difficulty === "number" ? o.difficulty : 1,
      rarity: typeof o.rarity === "string" ? o.rarity : "common",
      imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : "",
      unboxedAt: typeof o.unboxedAt === "string" ? o.unboxedAt : "",
    });
  }
  return out;
}

export function FriendProfileScreen({ friendNorm, onBack }: Props) {
  const [detailItem, setDetailItem] = useState<InventoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPublicProfile(friendNorm);
      setData(r);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [friendNorm]);

  useEffect(() => {
    void load();
  }, [load]);

  const profile = data?.profile ?? {};
  const inv = invFromProfile(profile);
  const sorted = [...inv].sort((a, b) => {
    const ra = raritySortRank(a.rarity);
    const rb = raritySortRank(b.rarity);
    if (rb !== ra) return rb - ra;
    return b.difficulty - a.difficulty;
  });

  const goldenCoins = typeof profile.goldenCoins === "number" ? profile.goldenCoins : 0;
  const endlessHiScore = typeof profile.endlessHiScore === "number" ? profile.endlessHiScore : 0;
  const gamesPlayed = typeof profile.gamesPlayed === "number" ? profile.gamesPlayed : 0;
  const totalCorrect = typeof profile.totalCorrect === "number" ? profile.totalCorrect : 0;
  const totalWrong = typeof profile.totalWrong === "number" ? profile.totalWrong : 0;
  const totalAnswered = typeof profile.totalAnswered === "number" ? profile.totalAnswered : 0;

  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FadeSlideIn delay={0} duration={420} fromY={10}>
            <Text style={styles.title}>Friend</Text>
            <Text style={styles.name}>{data?.display_name || friendNorm}</Text>
          </FadeSlideIn>

          {loading ? (
            <ActivityIndicator color="#ffe082" style={{ marginVertical: 24 }} />
          ) : error ? (
            <Text style={styles.err}>{error}</Text>
          ) : (
            <>
              <FadeSlideIn delay={60} duration={400} fromY={8} style={styles.card}>
                <Text style={styles.cardTitle}>Stats (last synced)</Text>
                <Text style={styles.line}>🪙 Golden coins: {goldenCoins}</Text>
                <Text style={styles.line}>Hi score (endless): {endlessHiScore}</Text>
                <Text style={styles.line}>Games played: {gamesPlayed}</Text>
                <Text style={styles.line}>
                  Correct / wrong: {totalCorrect} / {totalWrong}
                </Text>
                <Text style={styles.line}>Questions answered: {totalAnswered}</Text>
              </FadeSlideIn>

              <FadeSlideIn delay={120} duration={380} fromY={8}>
                <Text style={styles.invTitle}>Inventory</Text>
                {sorted.length === 0 ? (
                  <Text style={styles.emptyInv}>No animals synced yet (your friend must open the app online).</Text>
                ) : (
                  <View style={styles.invGrid}>
                    {sorted.map((item) => {
                      const uri = fullImageUrl(item.imageUrl);
                      const border = rarityBorderColor(item.rarity);
                      return (
                        <ScalePress
                          key={`${item.id}-${item.unboxedAt}`}
                          accessibilityRole="button"
                          accessibilityLabel={`View details for ${item.animalName}`}
                          scaleTo={0.97}
                          onPress={() => setDetailItem(item)}
                        >
                          <View style={[styles.invCard, { borderColor: border }]}>
                            <Image source={{ uri }} style={styles.thumb} resizeMode="contain" />
                            <Text style={styles.invName} numberOfLines={2}>
                              {item.animalName}
                            </Text>
                            <Text style={[styles.invRarity, { color: border }]}>{item.rarity}</Text>
                          </View>
                        </ScalePress>
                      );
                    })}
                  </View>
                )}
              </FadeSlideIn>
            </>
          )}

          <FadeSlideIn delay={180} duration={360} fromY={6}>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.backBtn}
              scaleTo={0.98}
              onPress={onBack}
            >
              <Text style={styles.backText}>Back</Text>
            </ScalePress>
          </FadeSlideIn>
        </ScrollView>
      </View>

      <InventoryAnimalDetailModal
        visible={detailItem !== null}
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(20, 12, 8, 0.55)",
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
  },
  title: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 22,
    color: "#ffcc80",
    marginBottom: 4,
    textAlign: "center",
  },
  name: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 18,
    color: "rgba(255,248,225,0.95)",
    textAlign: "center",
    marginBottom: 14,
  },
  err: { color: "#ffcdd2", textAlign: "center", marginBottom: 12 },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,193,7,0.5)",
  },
  cardTitle: {
    fontFamily: APP_FONT_FAMILY,
    color: "#ffe082",
    fontSize: 16,
    marginBottom: 10,
  },
  line: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 14,
    color: "rgba(255,248,225,0.95)",
    marginBottom: 6,
  },
  invTitle: {
    fontFamily: APP_FONT_FAMILY,
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: 360,
    fontSize: 17,
    color: "#ffe082",
    marginBottom: 10,
  },
  emptyInv: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 13,
    color: "rgba(255,248,225,0.85)",
    marginBottom: 12,
    textAlign: "center",
    maxWidth: 360,
  },
  invGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    maxWidth: 360,
    marginBottom: 16,
  },
  invCard: {
    width: 108,
    padding: 8,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
  },
  thumb: { width: "100%", height: 72, marginBottom: 6 },
  invName: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 11,
    color: "#fff8e1",
    textAlign: "center",
    minHeight: 28,
  },
  invRarity: { fontFamily: APP_FONT_FAMILY, fontSize: 10, fontWeight: "700" },
  backBtn: { paddingVertical: 12 },
  backText: { fontFamily: APP_FONT_FAMILY, color: "#ffe082", fontSize: 17, textAlign: "center" },
});
