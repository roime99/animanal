import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, ImageBackground, StyleSheet, Text, View } from "react-native";

import { FadeSlideIn } from "../components/FadeSlideIn";
import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { ScalePress } from "../components/ScalePress";
import type { PlayerStats } from "../services/playerStorage";

type Props = {
  score: number;
  wrongThisRun: number;
  stats: PlayerStats;
  onRetry: () => void;
  onHome: () => void;
  onOpenCase: () => void;
  onOpenInventory: () => void;
};

function ShimmerLine({ delay, children, style }: { delay: number; children: ReactNode; style?: object }) {
  const op = useRef(new Animated.Value(0)).current;
  const tx = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    op.setValue(0);
    tx.setValue(-8);
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(op, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(tx, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, [delay, op, tx]);

  return (
    <Animated.View style={[style, { opacity: op, transform: [{ translateX: tx }] }]}>{children}</Animated.View>
  );
}

export function EndlessResultsScreen({
  score,
  wrongThisRun,
  stats,
  onRetry,
  onHome,
  onOpenCase,
  onOpenInventory,
}: Props) {
  const boxScale = useRef(new Animated.Value(0.94)).current;
  const boxOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    boxScale.setValue(0.94);
    boxOp.setValue(0);
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.spring(boxScale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
        Animated.timing(boxOp, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 320);
    return () => clearTimeout(t);
  }, [boxOp, boxScale]);

  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bgRoot}
      imageStyle={styles.bgImage}
    >
      <View style={styles.container}>
      <FadeSlideIn delay={0} duration={540} fromY={-24}>
        <Text style={styles.title}>Game over</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={70} duration={480} fromY={16}>
        <Text style={styles.user}>{stats.displayName}</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={130} duration={480} fromY={12}>
        <Text style={styles.score}>
          This run: <Text style={styles.scoreValue}>{score}</Text> correct · {wrongThisRun} wrong
        </Text>
      </FadeSlideIn>
      <FadeSlideIn delay={180} duration={440} fromY={10}>
        <Text style={styles.hi}>Hi score: {stats.endlessHiScore}</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={220} duration={440} fromY={10}>
        <Text style={styles.coins}>🪙 Golden coins: {stats.goldenCoins ?? 0}</Text>
      </FadeSlideIn>

      <Animated.View style={[styles.statsBox, { opacity: boxOp, transform: [{ scale: boxScale }] }]}>
        <Text style={styles.statsTitle}>All-time stats</Text>
        <ShimmerLine delay={380} style={styles.statsLineWrap}>
          <Text style={styles.statsLine}>Games played: {stats.gamesPlayed}</Text>
        </ShimmerLine>
        <ShimmerLine delay={430} style={styles.statsLineWrap}>
          <Text style={styles.statsLine}>
            Total correct: {stats.totalCorrect} · Total wrong: {stats.totalWrong}
          </Text>
        </ShimmerLine>
        <ShimmerLine delay={480} style={styles.statsLineWrap}>
          <Text style={styles.statsLine}>Questions answered: {stats.totalAnswered}</Text>
        </ShimmerLine>
      </Animated.View>

      <FadeSlideIn delay={400} duration={460} fromY={20}>
        <View style={styles.caseRow}>
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Open animal case"
            style={styles.secondary}
            onPress={onOpenCase}
          >
            <Text style={styles.secondaryText}>Animal case</Text>
          </ScalePress>
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Inventory"
            style={styles.secondary}
            onPress={onOpenInventory}
          >
            <Text style={styles.secondaryText}>Inventory</Text>
          </ScalePress>
        </View>
      </FadeSlideIn>

      <FadeSlideIn delay={480} duration={480} fromY={18}>
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Start again"
          style={styles.primary}
          scaleTo={0.97}
          onPress={onRetry}
        >
          <Text style={styles.primaryText}>Start again</Text>
        </ScalePress>
      </FadeSlideIn>

      <FadeSlideIn delay={540} duration={440} fromY={12}>
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Home"
          style={styles.ghost}
          scaleTo={0.98}
          onPress={onHome}
        >
          <Text style={styles.ghostText}>Home</Text>
        </ScalePress>
      </FadeSlideIn>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bgRoot: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(255,243,224,0.88)",
  },
  title: { fontSize: 28, fontWeight: "800", color: "#d84315", marginBottom: 6 },
  user: { fontSize: 16, fontWeight: "700", color: "#5d4037", marginBottom: 12 },
  score: { fontSize: 16, color: "#1b1b1b", marginBottom: 6, fontWeight: "600", textAlign: "center" },
  scoreValue: { fontSize: 22, fontWeight: "900", color: "#1b1b1b" },
  hi: { fontSize: 16, color: "#5d4037", marginBottom: 8, fontWeight: "700" },
  coins: { fontSize: 17, color: "#f57f17", marginBottom: 16, fontWeight: "800" },
  statsBox: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#ffcc80",
  },
  statsTitle: { fontWeight: "800", color: "#e65100", marginBottom: 8 },
  statsLineWrap: { marginBottom: 4 },
  statsLine: { fontSize: 14, color: "#5d4037" },
  caseRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginBottom: 14,
    maxWidth: 320,
  },
  secondary: {
    backgroundColor: "#6a1b9a",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffd54f",
  },
  secondaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  primary: {
    backgroundColor: "#1565c0",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0d47a1",
    minWidth: 220,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  ghost: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1565c0",
    minWidth: 220,
    alignItems: "center",
  },
  ghostText: { color: "#1565c0", fontSize: 16, fontWeight: "700" },
});
