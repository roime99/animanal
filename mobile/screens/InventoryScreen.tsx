import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

import { FadeSlideIn } from "../components/FadeSlideIn";
import { InventoryAnimalDetailModal } from "../components/InventoryAnimalDetailModal";
import { ScalePress } from "../components/ScalePress";
import type { InventoryEntry } from "../services/playerStorage";
import { fullImageUrl } from "../services/gameApi";
import { rarityBorderColor, raritySortRank } from "../utils/rarityTheme";

type Props = {
  inventory: InventoryEntry[];
  onBack: () => void;
};

function AnimatedCard({
  item,
  index,
  uri,
  border,
}: {
  item: InventoryEntry;
  index: number;
  uri: string;
  border: string;
}) {
  const op = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    op.setValue(0);
    scale.setValue(0.9);
    rotate.setValue(0);
    const delay = Math.min(index * 48, 720);
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(op, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, { toValue: 1, friction: 7, tension: 140, useNativeDriver: true }),
        Animated.timing(rotate, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, [index, item.id, item.unboxedAt, op, rotate, scale]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["-4deg", "0deg"],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { borderColor: border, opacity: op, transform: [{ scale }, { rotate: spin }] },
      ]}
    >
      <Image source={{ uri }} style={styles.thumb} resizeMode="contain" />
      <Text style={styles.name} numberOfLines={2}>
        {item.animalName}
      </Text>
      <Text style={[styles.rarity, { color: border }]}>{item.rarity}</Text>
      <Text style={styles.meta}>Lv.{item.difficulty}</Text>
    </Animated.View>
  );
}

export function InventoryScreen({ inventory, onBack }: Props) {
  const [detailItem, setDetailItem] = useState<InventoryEntry | null>(null);
  const sorted = [...inventory].sort((a, b) => {
    const ra = raritySortRank(a.rarity);
    const rb = raritySortRank(b.rarity);
    if (ra !== rb) return ra - rb;
    return new Date(b.unboxedAt).getTime() - new Date(a.unboxedAt).getTime();
  });

  return (
    <View style={styles.root}>
      <FadeSlideIn delay={0} duration={520} fromY={-18}>
        <Text style={styles.title}>Your collection</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={70} duration={460} fromY={10}>
        <Text style={styles.sub}>
          {sorted.length} animal{sorted.length === 1 ? "" : "s"} unboxed
        </Text>
      </FadeSlideIn>

      <Animated.ScrollView
        style={styles.list}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {sorted.length === 0 ? (
          <FadeSlideIn delay={120} duration={480}>
            <Text style={styles.empty}>Open cases from the home menu to fill your inventory.</Text>
          </FadeSlideIn>
        ) : (
          <View style={styles.grid}>
            {sorted.map((item, idx) => {
              const uri = fullImageUrl(item.imageUrl);
              const border = rarityBorderColor(item.rarity);
              return (
                <ScalePress
                  key={`${item.id}-${item.unboxedAt}-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${item.animalName}`}
                  scaleTo={0.97}
                  onPress={() => setDetailItem(item)}
                >
                  <AnimatedCard item={item} index={idx} uri={uri} border={border} />
                </ScalePress>
              );
            })}
          </View>
        )}
      </Animated.ScrollView>

      <FadeSlideIn delay={200} duration={400} fromY={24} style={styles.backWrap}>
        <ScalePress accessibilityRole="button" style={styles.back} scaleTo={0.96} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </ScalePress>
      </FadeSlideIn>

      <InventoryAnimalDetailModal
        visible={detailItem !== null}
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3e5f5", paddingTop: 12 },
  list: { flex: 1 },
  title: { fontSize: 24, fontWeight: "900", color: "#4a148c", textAlign: "center" },
  sub: { fontSize: 14, color: "#6a1b9a", textAlign: "center", marginBottom: 12 },
  scroll: { padding: 16, paddingBottom: 100 },
  empty: { textAlign: "center", color: "#7e57c2", fontSize: 16, marginTop: 40, paddingHorizontal: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  card: {
    width: 148,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 3,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  thumb: { width: "100%", height: 96 },
  name: { fontSize: 13, fontWeight: "800", color: "#311b92", marginTop: 6, minHeight: 34 },
  rarity: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 2 },
  meta: { fontSize: 11, color: "#78909c", marginTop: 2 },
  backWrap: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  back: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: "#6a1b9a",
    borderRadius: 12,
    shadowColor: "#4a148c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  backText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
