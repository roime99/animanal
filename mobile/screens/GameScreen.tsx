import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GameCyclingBackdrop } from "../components/GameCyclingBackdrop";
import { useGameCyclingBackground } from "../hooks/useGameCyclingBackground";
import type { DifficultyKey, GameQuestion } from "../services/gameApi";
import { fetchGameStart, fullImageUrl } from "../services/gameApi";

type Props = {
  difficulty: DifficultyKey;
  /** Wikimedia-only when true (must match API `embed_mode`). */
  embedMode?: boolean;
  onFinish: (score: number, total: number, label: string) => void;
  onBack: () => void;
};

type PendingProgress = { nextScore: number; isLast: boolean } | null;

/** DOM styles for web — avoids RN Web Image + ScrollView layout issues with remote URLs. */
const imageWebStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  height: 280,
  objectFit: "contain",
  backgroundColor: "transparent",
  borderRadius: 12,
  marginBottom: 16,
  display: "block",
};

export function GameScreen({ difficulty, embedMode = false, onFinish, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [label, setLabel] = useState("");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<PendingProgress>(null);

  const { cycleIndex, flash, flashCorrect, flashWrong } = useGameCyclingBackground(
    !loading && !error && !!questions[index]
  );

  const q = questions[index];
  const total = questions.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchGameStart(difficulty, { embedMode });
        if (cancelled) return;
        setQuestions(data.questions);
        setLabel(data.difficulty_label);
        const second = data.questions[1];
        if (second?.image_url) {
          Image.prefetch(fullImageUrl(second.image_url)).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [difficulty, embedMode]);

  const prefetchNext = useCallback(() => {
    const nextQ = questions[index + 1];
    if (nextQ?.image_url) {
      Image.prefetch(fullImageUrl(nextQ.image_url)).catch(() => {});
    }
  }, [questions, index]);

  useEffect(() => {
    prefetchNext();
  }, [index, prefetchNext]);

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
      const isLast = index + 1 >= total;
      setPendingProgress({ nextScore, isLast });
      setAwaitingContinue(true);
    },
    [locked, q, score, index, total, flashCorrect, flashWrong]
  );

  const continueAfterRead = useCallback(() => {
    if (!awaitingContinue || !pendingProgress) return;
    setLocked(false);
    setPicked(null);
    setScore(pendingProgress.nextScore);
    if (pendingProgress.isLast) {
      onFinish(pendingProgress.nextScore, total, label);
    } else {
      setIndex((i) => i + 1);
    }
    setPendingProgress(null);
    setAwaitingContinue(false);
  }, [awaitingContinue, pendingProgress, onFinish, total, label]);

  const imageUri = useMemo(() => (q ? fullImageUrl(q.image_url) : ""), [q]);
  useEffect(() => {
    setImageError(null);
  }, [imageUri]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
        <Text style={styles.loadingText}>Loading questions…</Text>
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
          <Text style={styles.progress}>
            Question {index + 1} / {total} · Score {score}
          </Text>
          {Platform.OS === "web" ? (
            // RN Web's <Image> uses CSS background-image on nested Views; remote URLs + % widths in ScrollView often fail to paint. Use a real <img> on web.
            <>
              <img
                src={imageUri}
                alt=""
                style={imageWebStyle}
                onError={() => setImageError(imageUri || "unknown")}
              />
              {imageError ? <Text style={styles.imageError}>Image failed to load: {imageError}</Text> : null}
            </>
          ) : (
            <>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
                onError={() => setImageError(imageUri || "unknown")}
              />
              {imageError ? <Text style={styles.imageError}>Image failed to load: {imageError}</Text> : null}
            </>
          )}
          <View style={styles.answers}>
            {q.options.map((opt) => {
              const showResult = picked !== null;
              const isCorrect = opt === q.correct_answer;
              const isWrongPick = showResult && picked === opt && opt !== q.correct_answer;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  accessibilityLabel={opt}
                  style={({ pressed }) => [
                    styles.answerBtn,
                    showResult && isCorrect && styles.answerCorrect,
                    isWrongPick && styles.answerWrong,
                    (locked || showResult) && styles.answerDisabled,
                    pressed && !showResult && styles.pressed,
                  ]}
                  onPress={() => handlePick(opt)}
                  disabled={locked || showResult}
                >
                  <Text style={styles.answerText}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
          {picked !== null && (
            <View style={styles.funFact}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue"
                style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
                onPress={continueAfterRead}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
              </Pressable>
              <Text style={styles.funFactLabel}>Fun fact</Text>
              <Text style={styles.funFactText}>{q.fun_fact || "—"}</Text>
            </View>
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
  progress: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 6,
  },
  image: {
    width: "100%",
    height: 280,
    backgroundColor: "transparent",
    borderRadius: 12,
    marginBottom: 16,
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
  retry: { padding: 12 },
  retryText: { fontSize: 16, color: "#1565c0", fontWeight: "600" },
});
