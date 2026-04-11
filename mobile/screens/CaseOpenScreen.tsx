import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FadeSlideIn } from "../components/FadeSlideIn";
import { ScalePress } from "../components/ScalePress";
import type { InventoryEntry } from "../services/playerStorage";
import { CASE_OPEN_COST } from "../services/playerStorage";
import { buildCaseStrip, pickAnimalForRarity, rollCaseRarity } from "../services/caseRoll";
import type { CasePoolAnimal } from "../services/gameApi";
import { fetchCasePool, fullImageUrl } from "../services/gameApi";
import { playCoinSound } from "../services/playCoinSound";
import { rarityBorderColor, rarityGlowColor, rarityRevealTint } from "../utils/rarityTheme";

const { width: SCREEN_W } = Dimensions.get("window");
const SLOT = Math.min(112, Math.max(96, Math.floor(SCREEN_W * 0.22)));
const SLOT_MARGIN_H = 2;
const CELL_STEP = SLOT + SLOT_MARGIN_H * 2;
const STRIP_LEN = 52;
const WIN_INDEX = 38;

type Props = {
  goldenCoins: number;
  soundMuted: boolean;
  /** Use Wikimedia-only pool (matches endless embed mode). */
  embedMode: boolean;
  onOpenCase: (entry: Omit<InventoryEntry, "unboxedAt">) => Promise<void>;
  onBack: () => void;
};

function StripItem({ animal }: { animal: CasePoolAnimal }) {
  const uri = fullImageUrl(animal.image_url);
  const border = rarityBorderColor(animal.rarity);
  const glow = rarityGlowColor(animal.rarity);
  return (
    <View
      style={[
        styles.slot,
        { width: SLOT, borderColor: border, shadowColor: border, marginHorizontal: SLOT_MARGIN_H },
      ]}
    >
      <View style={[styles.slotGlow, { backgroundColor: glow }]} />
      <Image source={{ uri }} style={styles.slotImg} resizeMode="contain" />
      <Text style={styles.slotName} numberOfLines={2}>
        {animal.animal_name}
      </Text>
    </View>
  );
}

export function CaseOpenScreen({ goldenCoins, soundMuted, embedMode, onOpenCase, onBack }: Props) {
  const [pool, setPool] = useState<CasePoolAnimal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [strip, setStrip] = useState<CasePoolAnimal[] | null>(null);
  const [phase, setPhase] = useState<"idle" | "spinning" | "landed">("idle");
  const [unboxed, setUnboxed] = useState<CasePoolAnimal | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const maskWidthRef = useRef(Math.min(SCREEN_W - 40, 400));

  const markerPulse = useRef(new Animated.Value(1)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const winScale = useRef(new Animated.Value(1)).current;
  const revOp = useRef(new Animated.Value(0)).current;
  const revScale = useRef(new Animated.Value(0.88)).current;
  const spinPulse = useRef(new Animated.Value(1)).current;
  const loadBreath = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const animals = await fetchCasePool({ embedMode });
        if (!cancelled) setPool(animals);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedMode]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(markerPulse, {
          toValue: 1.14,
          duration: 880,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(markerPulse, {
          toValue: 1,
          duration: 880,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [markerPulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -6,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatY]);

  useEffect(() => {
    if (!pool) return;
    winScale.setValue(0.9);
    Animated.spring(winScale, {
      toValue: 1,
      friction: 7,
      tension: 110,
      useNativeDriver: true,
    }).start();
  }, [pool, winScale]);

  useEffect(() => {
    if (phase !== "landed" || !unboxed) return;
    revOp.setValue(0);
    revScale.setValue(0.82);
    Animated.parallel([
      Animated.spring(revScale, {
        toValue: 1,
        friction: 6,
        tension: 150,
        useNativeDriver: true,
      }),
      Animated.timing(revOp, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [phase, unboxed, revOp, revScale]);

  useEffect(() => {
    if (phase !== "spinning") {
      spinPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(spinPulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(spinPulse, { toValue: 0.35, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, spinPulse]);

  useEffect(() => {
    if (pool || loadError) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(loadBreath, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(loadBreath, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pool, loadError, loadBreath]);

  const canOpen = goldenCoins >= CASE_OPEN_COST && pool && pool.length > 0 && phase === "idle";

  const onMaskLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) maskWidthRef.current = w;
  }, []);

  const runOpen = useCallback(async () => {
    if (!pool?.length || phase !== "idle") return;
    if (goldenCoins < CASE_OPEN_COST) return;

    const rolled = rollCaseRarity();
    const winner = pickAnimalForRarity(pool, rolled);
    const row = buildCaseStrip(pool, winner, STRIP_LEN, WIN_INDEX);
    setUnboxed(winner);
    setStrip(row);
    setPhase("spinning");

    const viewportW = maskWidthRef.current;
    const endX = viewportW / 2 - SLOT / 2 - SLOT_MARGIN_H - WIN_INDEX * CELL_STEP;
    const startX = endX + 2400 + Math.random() * 320;

    scrollX.setValue(startX);
    requestAnimationFrame(() => {
      Animated.timing(scrollX, {
        toValue: endX,
        duration: 7200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(async ({ finished }) => {
        if (!finished) return;
        setPhase("landed");
        void playCoinSound({ muted: soundMuted });
        try {
          await onOpenCase({
            id: winner.id,
            animalName: winner.animal_name,
            difficulty: winner.difficulty,
            rarity: winner.rarity,
            imageUrl: winner.image_url,
          });
        } catch {
          /* ignore */
        }
      });
    });
  }, [pool, phase, goldenCoins, scrollX, soundMuted, onOpenCase]);

  const reset = useCallback(() => {
    setStrip(null);
    setUnboxed(null);
    setPhase("idle");
    scrollX.setValue(0);
  }, [scrollX]);

  if (loadError) {
    return (
      <View style={styles.centered}>
        <FadeSlideIn delay={0} duration={480} fromY={16}>
          <Text style={styles.errTitle}>Case unavailable</Text>
        </FadeSlideIn>
        <FadeSlideIn delay={100} duration={440}>
          <Text style={styles.errBody}>{loadError}</Text>
        </FadeSlideIn>
        <FadeSlideIn delay={200} duration={400}>
          <ScalePress accessibilityRole="button" style={styles.btnGhost} scaleTo={0.97} onPress={onBack}>
            <Text style={styles.btnGhostText}>Back</Text>
          </ScalePress>
        </FadeSlideIn>
      </View>
    );
  }

  if (!pool) {
    return (
      <View style={styles.centered}>
        <Animated.View style={{ opacity: loadBreath }}>
          <ActivityIndicator size="large" color="#ce93d8" />
        </Animated.View>
        <FadeSlideIn delay={120} duration={500}>
          <Text style={styles.loading}>Loading case pool…</Text>
        </FadeSlideIn>
        <FadeSlideIn delay={260} duration={400}>
          <ScalePress accessibilityRole="button" style={styles.btnGhost} scaleTo={0.97} onPress={onBack}>
            <Text style={styles.btnGhostText}>Back</Text>
          </ScalePress>
        </FadeSlideIn>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FadeSlideIn delay={0} duration={520} fromY={-20}>
        <Text style={styles.title}>Animal case</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={70} duration={480} fromY={12}>
        <Text style={styles.sub}>
          {CASE_OPEN_COST} 🪙 · Roll the rarity, unbox a random animal from that tier.
        </Text>
      </FadeSlideIn>
      <FadeSlideIn delay={130} duration={460} fromY={10}>
        <Animated.Text
          style={[
            styles.purse,
            { transform: [{ translateY: floatY }] },
          ]}
        >
          Your coins: <Text style={styles.purseVal}>{goldenCoins}</Text>
        </Animated.Text>
      </FadeSlideIn>

      <Animated.View style={[styles.windowOuter, { transform: [{ scale: winScale }] }]}>
        <Animated.View style={{ transform: [{ scale: markerPulse }], alignSelf: "center" }}>
          <View style={styles.markerTop} />
        </Animated.View>
        <View style={styles.windowMask} onLayout={onMaskLayout}>
          <Animated.View style={[styles.strip, { transform: [{ translateX: scrollX }] }]}>
            {strip?.map((a, i) => (
              <StripItem key={`${a.id}-${i}`} animal={a} />
            ))}
          </Animated.View>
        </View>
        <Animated.View style={{ transform: [{ scale: markerPulse }], alignSelf: "center" }}>
          <View style={styles.markerBottom} />
        </Animated.View>
      </Animated.View>

      {phase === "landed" && unboxed ? (
        <Animated.View
          style={[
            styles.reveal,
            {
              borderColor: rarityBorderColor(unboxed.rarity),
              backgroundColor: rarityRevealTint(unboxed.rarity),
              opacity: revOp,
              transform: [{ scale: revScale }],
            },
          ]}
        >
          <Text style={[styles.revealRarity, { color: rarityBorderColor(unboxed.rarity) }]}>
            {unboxed.rarity.toUpperCase()}
          </Text>
          <Text style={styles.revealName}>{unboxed.animal_name}</Text>
        </Animated.View>
      ) : null}

      <FadeSlideIn delay={180} duration={400} style={styles.actions}>
        {phase === "idle" ? (
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Open case"
            style={[styles.btnPrimary, !canOpen && styles.disabled]}
            scaleTo={0.96}
            onPress={() => void runOpen()}
            disabled={!canOpen}
          >
            <Text style={styles.btnPrimaryText}>Open case</Text>
          </ScalePress>
        ) : phase === "spinning" ? (
          <Animated.Text style={[styles.spinning, { opacity: spinPulse }]}>Opening…</Animated.Text>
        ) : (
          <ScalePress accessibilityRole="button" style={styles.btnPrimary} scaleTo={0.96} onPress={reset}>
            <Text style={styles.btnPrimaryText}>Open another</Text>
          </ScalePress>
        )}

        <ScalePress
          accessibilityRole="button"
          style={styles.btnGhost}
          scaleTo={0.98}
          onPress={onBack}
          disabled={phase === "spinning"}
        >
          <Text style={styles.btnGhostText}>Back</Text>
        </ScalePress>
      </FadeSlideIn>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, paddingTop: 12, backgroundColor: "#1a0a24" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#1a0a24" },
  loading: { marginTop: 12, color: "#e1bee7", fontSize: 15 },
  errTitle: { fontSize: 20, fontWeight: "800", color: "#ffab91", marginBottom: 8 },
  errBody: { color: "#f8bbd0", textAlign: "center", marginBottom: 20 },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#ffd54f",
    textAlign: "center",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 8,
  },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.82)", textAlign: "center", marginBottom: 10, lineHeight: 20 },
  purse: { textAlign: "center", color: "#e1bee7", marginBottom: 16, fontSize: 15 },
  purseVal: { fontWeight: "900", color: "#ffe082" },
  windowOuter: {
    alignSelf: "center",
    width: "100%",
    maxWidth: Math.min(SCREEN_W - 32, 400),
    marginBottom: 20,
  },
  windowMask: {
    height: SLOT + 52,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#6a1b9a",
  },
  strip: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  slot: {
    height: SLOT + 44,
    borderRadius: 8,
    borderWidth: 3,
    padding: 4,
    backgroundColor: "rgba(30,15,40,0.95)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-start",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  slotGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  slotImg: { width: SLOT - 14, height: SLOT - 14 },
  slotName: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 2,
    maxWidth: SLOT,
  },
  markerTop: {
    alignSelf: "center",
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#ffd54f",
    marginBottom: 4,
    zIndex: 2,
  },
  markerBottom: {
    alignSelf: "center",
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#ffd54f",
    marginTop: 4,
    zIndex: 2,
  },
  reveal: {
    alignItems: "center",
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  revealRarity: { fontSize: 13, fontWeight: "900", letterSpacing: 1.2 },
  revealName: { fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 4 },
  actions: { gap: 12, alignItems: "center" },
  btnPrimary: {
    backgroundColor: "#7b1fa2",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd54f",
    minWidth: 220,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 24 },
  btnGhostText: { color: "#ce93d8", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  spinning: { color: "#e1bee7", fontSize: 16, fontWeight: "700" },
});
