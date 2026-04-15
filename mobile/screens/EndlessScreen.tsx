import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GameCyclingBackdrop } from "../components/GameCyclingBackdrop";
import { HIERARCHY_MODE_OPTIONS } from "../constants/hierarchyModes";
import { useGameCyclingBackground } from "../hooks/useGameCyclingBackground";
import { debugLog } from "../utils/debugLog";
import type { GameQuestion, LevelNumber } from "../services/gameApi";
import { difficultyForLevel, fetchGameStart, fullImageUrl } from "../services/gameApi";
import { ScalePress } from "../components/ScalePress";
import { playCoinSound } from "../services/playCoinSound";

type Props = {
  goldenCoins: number;
  soundMuted: boolean;
  /** Wikimedia URLs only + Commons-style embed HTML on web (no local images folder). */
  embedMode: boolean;
  /** Server `hierarchy_mode`: path-segment match on DB hierarchy (e.g. /birds/). */
  hierarchyMode?: string | null;
  onEarnCoins: (amount: number) => Promise<void>;
  onFinish: (score: number, wrongAnswers: number, context?: { hierarchyMode?: string }) => void;
  onBack: () => void;
};

type PendingProgress = { nextScore: number; isLast: boolean; shouldEnd: boolean } | null;

/** DOM styles for web — avoids RN Web Image + ScrollView layout issues with remote URLs. */
const imageWebStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  height: 280,
  objectFit: "contain",
  backgroundColor: "transparent",
  borderRadius: 12,
  marginBottom: 0,
  display: "block",
};

function heartsArray(lives: number) {
  return Array.from({ length: 3 }, (_, i) => i < lives);
}

function StaggerAnswer({
  opt,
  delay,
  questionKey,
  showResult,
  isCorrect,
  isWrongPick,
  locked,
  onPress,
  children,
}: {
  opt: string;
  delay: number;
  questionKey: string;
  showResult: boolean;
  isCorrect: boolean;
  isWrongPick: boolean;
  locked: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    op.setValue(0);
    ty.setValue(18);
    Animated.parallel([
      Animated.timing(op, {
        toValue: 1,
        duration: 440,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ty, {
        toValue: 0,
        duration: 440,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [questionKey, delay, op, ty]);

  return (
    <Animated.View style={{ opacity: op, transform: [{ translateY: ty }], width: "100%", alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={opt}
        style={({ pressed }) => [
          styles.answerBtn,
          showResult && isCorrect && styles.answerCorrect,
          isWrongPick && styles.answerWrong,
          (locked || showResult) && styles.answerDisabled,
          pressed && !showResult && styles.pressed,
        ]}
        onPress={onPress}
        disabled={locked || showResult}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function normalizeAnimalName(name: string): string {
  return name.trim().toLowerCase();
}

export function EndlessScreen({
  goldenCoins,
  soundMuted,
  embedMode,
  hierarchyMode,
  onEarnCoins,
  onFinish,
  onBack,
}: Props) {
  const wrongCountRef = useRef(0);
  /** Ref = source of truth so streak never resets due to stale closure between answers. */
  const winStreakRef = useRef(0);
  const seenAnimalNamesRef = useRef<Set<string>>(new Set());
  const loadPulse = useRef(new Animated.Value(0.5)).current;
  const imgOpacity = useRef(new Animated.Value(1)).current;
  const imgScale = useRef(new Animated.Value(1)).current;
  const topBarOpacity = useRef(new Animated.Value(1)).current;
  const topBarY = useRef(new Animated.Value(0)).current;
  const factOpacity = useRef(new Animated.Value(0)).current;
  const factTranslate = useRef(new Animated.Value(12)).current;
  const popOpacity = useRef(new Animated.Value(0)).current;
  const popScale = useRef(new Animated.Value(0.35)).current;
  const popTranslateY = useRef(new Animated.Value(0)).current;
  const [popLines, setPopLines] = useState<string[]>([]);

  const [level, setLevel] = useState<LevelNumber>(1);
  const [lives, setLives] = useState(3);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);

  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<PendingProgress>(null);

  const q = questions[index];
  const totalInBatch = questions.length;
  const { cycleIndex, flash, flashCorrect, flashWrong } = useGameCyclingBackground(!loading && !error && !!q);
  const questionKey = useMemo(() => (q ? `${level}-${index}-${q.id}` : ""), [level, index, q]);
  const groupLabel = useMemo(() => {
    const trimmed = (hierarchyMode ?? "").trim();
    const raw = trimmed.toLowerCase();
    if (!raw) return "";
    return HIERARCHY_MODE_OPTIONS.find((o) => o.id === raw)?.label ?? trimmed;
  }, [hierarchyMode]);

  useEffect(() => {
    debugLog("EndlessScreen", "active group filter", {
      hierarchyMode: hierarchyMode?.trim() || null,
      groupLabel: groupLabel || null,
    });
  }, [hierarchyMode, groupLabel]);

  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(loadPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(loadPulse, { toValue: 0.38, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, loadPulse]);

  useEffect(() => {
    if (!q || loading) return;
    imgOpacity.setValue(0);
    imgScale.setValue(0.88);
    topBarOpacity.setValue(0);
    topBarY.setValue(-14);
    Animated.parallel([
      Animated.timing(imgOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(imgScale, { toValue: 1, friction: 7, tension: 130, useNativeDriver: true }),
      Animated.timing(topBarOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(topBarY, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [questionKey, loading, q, imgOpacity, imgScale, topBarOpacity, topBarY]);

  useEffect(() => {
    if (picked === null) {
      factOpacity.setValue(0);
      factTranslate.setValue(14);
      return;
    }
    factOpacity.setValue(0);
    factTranslate.setValue(20);
    Animated.parallel([
      Animated.timing(factOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(factTranslate, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [picked, factOpacity, factTranslate]);

  const loadBatch = useCallback(
    async (lvl: LevelNumber) => {
      setLoading(true);
      setError(null);
      setPicked(null);
      setLocked(false);
      setAwaitingContinue(false);
      setPendingProgress(null);
      setImageError(null);

      try {
        const exclude = [...seenAnimalNamesRef.current];
        debugLog("EndlessScreen", "loadBatch", {
          level: lvl,
          difficulty: difficultyForLevel(lvl),
          hierarchyMode: hierarchyMode?.trim() || null,
          excludeCount: exclude.length,
        });
        const data = await fetchGameStart(difficultyForLevel(lvl), {
          excludeAnimalNames: exclude,
          hierarchyMode: hierarchyMode?.trim() || undefined,
          embedMode,
        });
        setQuestions(data.questions);
        setIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [hierarchyMode, embedMode]
  );

  useEffect(() => {
    loadBatch(level);
  }, [level, loadBatch]);

  const showCoinRewardPopup = useCallback(
    (totalEarned: number, streakBonus: number) => {
      const lines =
        streakBonus > 0
          ? [`+${totalEarned} 🪙`, `+${streakBonus} streak bonus!`]
          : [`+${totalEarned} 🪙`];
      setPopLines(lines);
      requestAnimationFrame(() => {
        popOpacity.setValue(0);
        popScale.setValue(0.35);
        popTranslateY.setValue(0);
        Animated.sequence([
          Animated.parallel([
            Animated.timing(popOpacity, {
              toValue: 1,
              duration: 140,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(popScale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
          Animated.delay(320),
          Animated.parallel([
            Animated.timing(popOpacity, {
              toValue: 0,
              duration: 520,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(popTranslateY, {
              toValue: -88,
              duration: 620,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(popScale, {
              toValue: 1.12,
              duration: 620,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]).start(() => {
          setPopLines([]);
          popTranslateY.setValue(0);
          popScale.setValue(0.35);
        });
      });
    },
    [popOpacity, popScale, popTranslateY]
  );

  const handlePick = useCallback(
    (choice: string) => {
      if (locked || !q) return;

      setLocked(true);
      setPicked(choice);

      const correct = choice === q.correct_answer;
      if (correct) {
        flashCorrect();
      } else {
        flashWrong();
      }
      const nextScore = score + (correct ? 1 : 0);
      const isLast = index + 1 >= totalInBatch;

      const willBeWrong = !correct;
      if (willBeWrong) {
        wrongCountRef.current += 1;
        winStreakRef.current = 0;
      } else {
        const ordinal = score + 1;
        const newStreak = winStreakRef.current + 1;
        winStreakRef.current = newStreak;
        /* +2 bonus on every correct once you've reached 3+ in a row; keeps until a wrong answer. */
        const streakBonus = newStreak >= 3 ? 2 : 0;
        const earned = ordinal + streakBonus;
        void playCoinSound({ muted: soundMuted });
        showCoinRewardPopup(earned, streakBonus);
        void onEarnCoins(earned);
      }
      const nextLives = willBeWrong ? lives - 1 : lives;
      setLives(nextLives);

      setPendingProgress({
        nextScore,
        isLast,
        shouldEnd: nextLives <= 0,
      });
      setAwaitingContinue(true);
    },
    [locked, q, score, index, totalInBatch, lives, soundMuted, onEarnCoins, showCoinRewardPopup, flashCorrect, flashWrong]
  );

  const continueAfterRead = useCallback(() => {
    if (!awaitingContinue || !pendingProgress || !q) return;

    seenAnimalNamesRef.current.add(normalizeAnimalName(q.correct_answer));

    setLocked(false);
    setPicked(null);
    setScore(pendingProgress.nextScore);

    if (pendingProgress.shouldEnd) {
      onFinish(pendingProgress.nextScore, wrongCountRef.current, {
        hierarchyMode: hierarchyMode?.trim() || undefined,
      });
      return;
    }

    if (pendingProgress.isLast) {
      setLevel((l) => (l < 10 ? ((l + 1) as LevelNumber) : l));
    } else {
      setIndex((i) => i + 1);
    }

    setPendingProgress(null);
    setAwaitingContinue(false);
  }, [awaitingContinue, pendingProgress, onFinish, q, hierarchyMode]);

  const imageUri = useMemo(() => (q ? fullImageUrl(q.image_url) : ""), [q]);
  useEffect(() => {
    setImageError(null);
  }, [imageUri]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Animated.View style={{ opacity: loadPulse }}>
          <ActivityIndicator size="large" color="#2e7d32" />
        </Animated.View>
        <Text style={styles.loadingText}>
          {groupLabel ? `Loading ${groupLabel} questions…` : "Loading endless questions…"}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Could not load game</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.retry} onPress={onBack}>
          <Text style={styles.retryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!q) {
    return (
      <View style={styles.centered}>
        <Text>No questions available.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.retry} onPress={onBack}>
          <Text style={styles.retryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <GameCyclingBackdrop cycleIndex={cycleIndex} flash={flash} overlayStyle={styles.bgOverlay}>
      <Animated.View
          pointerEvents="none"
          style={[
            styles.coinPop,
            {
              opacity: popOpacity,
              transform: [{ translateY: popTranslateY }, { scale: popScale }],
            },
          ]}
        >
          {popLines.map((line, i) => (
            <Text key={i} style={styles.coinPopText}>
              {line}
            </Text>
          ))}
        </Animated.View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View
            style={[
              styles.topBar,
              { opacity: topBarOpacity, transform: [{ translateY: topBarY }] },
            ]}
          >
            <View style={styles.hearts}>
              {heartsArray(lives).map((full, i) => (
                <Text key={i} style={[styles.heart, full ? styles.heartFull : styles.heartEmpty]}>
                  ♥
                </Text>
              ))}
            </View>
            <Text style={styles.topBarText}>Level {level}</Text>
            <Text style={styles.topBarTextMuted}>Score {score}</Text>
          </Animated.View>
          {groupLabel ? (
            <Text style={styles.groupBanner} numberOfLines={2}>
              Group: {groupLabel}
            </Text>
          ) : null}
          <View style={styles.coinRow}>
            <Text style={styles.coinPurse}>
              🪙 {goldenCoins}
            </Text>
          </View>

          {Platform.OS === "web" ? (
            <>
              <Animated.View
                style={{
                  width: "100%",
                  opacity: imgOpacity,
                  transform: [{ scale: imgScale }],
                  marginBottom: 16,
                }}
              >
                {embedMode && q.image_embed_html ? (
                  createElement("div", {
                    style: { width: "100%", maxHeight: 300, overflow: "hidden" },
                    dangerouslySetInnerHTML: { __html: q.image_embed_html },
                  })
                ) : (
                  <img
                    src={imageUri}
                    alt=""
                    style={imageWebStyle}
                    onError={() => setImageError(imageUri || "unknown")}
                  />
                )}
              </Animated.View>
              {imageError ? <Text style={styles.imageError}>Image failed to load: {imageError}</Text> : null}
            </>
          ) : (
            <>
              <Animated.View
                style={{
                  width: "100%",
                  marginBottom: 16,
                  opacity: imgOpacity,
                  transform: [{ scale: imgScale }],
                }}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode="contain"
                  onError={() => setImageError(imageUri || "unknown")}
                />
              </Animated.View>
              {imageError ? <Text style={styles.imageError}>Image failed to load: {imageError}</Text> : null}
            </>
          )}

          <View style={styles.answers}>
            {q.options.map((opt, i) => {
              const showResult = picked !== null;
              const isCorrect = opt === q.correct_answer;
              const isWrongPick = showResult && picked === opt && opt !== q.correct_answer;
              return (
                <StaggerAnswer
                  key={opt}
                  opt={opt}
                  delay={i * 72}
                  questionKey={questionKey}
                  showResult={showResult}
                  isCorrect={isCorrect}
                  isWrongPick={isWrongPick}
                  locked={locked}
                  onPress={() => handlePick(opt)}
                >
                  <Text style={styles.answerText}>{opt}</Text>
                </StaggerAnswer>
              );
            })}
          </View>

          {picked !== null && (
            <Animated.View
              style={[
                styles.funFact,
                { opacity: factOpacity, transform: [{ translateY: factTranslate }] },
              ]}
            >
              <ScalePress
                accessibilityRole="button"
                accessibilityLabel="Continue"
                style={styles.continueBtn}
                scaleTo={0.97}
                onPress={continueAfterRead}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
              </ScalePress>
              <Text style={styles.funFactLabel}>Fun fact</Text>
              <Text style={styles.funFactText}>{q.fun_fact || "—"}</Text>
            </Animated.View>
          )}
        </ScrollView>
    </GameCyclingBackdrop>
  );
}

const styles = StyleSheet.create({
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.28)" },
  scrollView: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fafafa",
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#555" },
  errorTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8, color: "#c62828" },
  errorBody: { textAlign: "center", color: "#444", marginBottom: 20 },
  retry: { padding: 12 },
  retryText: { fontSize: 16, color: "#1565c0", fontWeight: "600" },

  topBar: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hearts: { flexDirection: "row", gap: 6 },
  heart: { fontSize: 18 },
  heartFull: { color: "#e53935", textShadowColor: "#000", textShadowRadius: 1 },
  heartEmpty: { color: "#cfd8dc" },
  topBarText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 6,
  },
  topBarTextMuted: {
    fontSize: 14,
    fontWeight: "800",
    color: "rgba(255,255,255,0.9)",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 6,
  },
  groupBanner: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffecb3",
    textAlign: "center",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowRadius: 6,
    paddingHorizontal: 8,
  },
  coinRow: { alignItems: "center", marginBottom: 10 },
  coinPurse: {
    fontSize: 17,
    fontWeight: "900",
    color: "#ffecb3",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowRadius: 8,
    letterSpacing: 0.5,
  },
  coinPop: {
    position: "absolute",
    top: "28%",
    left: 0,
    right: 0,
    zIndex: 50,
    alignItems: "center",
  },
  coinPopText: {
    fontSize: 26,
    fontWeight: "900",
    color: "#ffd54f",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  image: {
    width: "100%",
    height: 280,
    backgroundColor: "transparent",
    borderRadius: 12,
  },
  answers: { gap: 10, alignItems: "center" },
  answerBtn: {
    backgroundColor: "#90caf9",
    width: "88%",
    maxWidth: 360,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1565c0",
  },
  answerCorrect: { backgroundColor: "#66bb6a", borderColor: "#1b5e20" },
  answerWrong: { backgroundColor: "#ef9a9a", borderColor: "#b71c1c" },
  answerDisabled: { opacity: 0.95 },
  pressed: { opacity: 0.88 },
  answerText: { fontSize: 17, fontWeight: "600", color: "#1b1b1b", textAlign: "center" },

  funFact: {
    marginTop: 20,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  funFactLabel: { fontWeight: "700", marginBottom: 6, color: "#37474f" },
  funFactText: { fontSize: 15, lineHeight: 22, color: "#455a64" },
  continueBtn: {
    marginTop: 12,
    alignSelf: "center",
    backgroundColor: "#1565c0",
    borderColor: "#0d47a1",
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  continueBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  imageError: { marginBottom: 16, fontSize: 14, color: "#b71c1c", fontWeight: "600" },
});

