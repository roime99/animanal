import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchAnimalDetail, fullImageUrl, type AnimalDetail } from "../services/gameApi";
import type { InventoryEntry } from "../services/playerStorage";
import { rarityBorderColor } from "../utils/rarityTheme";

type Props = {
  visible: boolean;
  item: InventoryEntry | null;
  onClose: () => void;
};

export function InventoryAnimalDetailModal({ visible, item, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AnimalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !item) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAnimalDetail(item.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item?.id]);

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.94);
      opacity.setValue(0);
      return;
    }
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, scale]);

  if (!item) return null;

  const border = rarityBorderColor(item.rarity);
  const imageUri = detail ? fullImageUrl(detail.image_url) : fullImageUrl(item.imageUrl);
  const title = detail?.animal_name ?? item.animalName;
  const family = (detail?.animal_family ?? "").trim();
  const funFact = (detail?.fun_fact ?? "").trim();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.backdrop}
          onPress={onClose}
        />
        <Animated.View style={[styles.sheetWrap, { opacity, transform: [{ scale }] }]}>
          <View style={[styles.card, { borderColor: border }]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollInner}
            >
              <Text style={styles.animalTitle} numberOfLines={3}>
                {title}
              </Text>
              <Text style={[styles.rarityPill, { color: border }]}>{item.rarity}</Text>

              <View style={styles.imageWrap}>
                {loading ? (
                  <View style={styles.imageLoading}>
                    <ActivityIndicator size="large" color="#6a1b9a" />
                  </View>
                ) : null}
                <Image
                  source={{ uri: imageUri }}
                  style={styles.heroImage}
                  resizeMode="contain"
                  accessibilityLabel={title}
                />
              </View>

              {error ? (
                <Text style={styles.errText}>{error}</Text>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Family</Text>
                  <Text style={styles.sectionBody}>{family || "—"}</Text>
                  <Text style={styles.sectionLabel}>Fun fact</Text>
                  <Text style={styles.funFact}>{funFact || "—"}</Text>
                </>
              )}

              <Text style={styles.metaHint}>Lv.{item.difficulty}</Text>
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close card"
              style={styles.closeBtn}
              onPress={onClose}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 12, 8, 0.72)",
  },
  sheetWrap: {
    width: "100%",
    maxWidth: 400,
    zIndex: 2,
  },
  card: {
    backgroundColor: "#fffef9",
    borderRadius: 16,
    borderWidth: 3,
    maxHeight: 560,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  scrollInner: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
  },
  animalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#311b92",
    textAlign: "center",
    marginBottom: 6,
  },
  rarityPill: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 12,
  },
  imageWrap: {
    width: "100%",
    minHeight: 220,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: "rgba(106, 27, 154, 0.06)",
    overflow: "hidden",
  },
  imageLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  heroImage: {
    width: "100%",
    height: 260,
    backgroundColor: "transparent",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#7e57c2",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionBody: {
    fontSize: 17,
    fontWeight: "700",
    color: "#4a148c",
    marginBottom: 14,
    lineHeight: 24,
  },
  funFact: {
    fontSize: 16,
    color: "#4527a0",
    lineHeight: 24,
    marginBottom: 8,
  },
  errText: {
    fontSize: 14,
    color: "#c62828",
    marginBottom: 8,
    lineHeight: 20,
  },
  metaHint: {
    fontSize: 12,
    color: "#9e9e9e",
    marginTop: 4,
    marginBottom: 4,
  },
  closeBtn: {
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#6a1b9a",
    borderTopWidth: 1,
    borderTopColor: "rgba(106, 27, 154, 0.2)",
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
});
