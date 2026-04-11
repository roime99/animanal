import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { GameQuestion } from "../services/gameApi";
import { fullImageUrl } from "../services/gameApi";
type Props = {
  question: GameQuestion;
  roundSeq: number;
  endlessLevel: number;
  poolLabel: string;
  myPoints: number;
  oppPoints: number;
  pointsToWin: number;
  imageRevealed: boolean;
  myWrongThisRound: boolean;
  /** When true, loading hint refers to the bot instead of a second human. */
  opponentIsBot?: boolean;
  onImageReady: () => void;
  onGuess: (choice: string) => void;
  onBack: () => void;
};

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

export function OnlineGameScreen({
  question,
  roundSeq,
  endlessLevel,
  poolLabel,
  myPoints,
  oppPoints,
  pointsToWin,
  imageRevealed,
  myWrongThisRound,
  opponentIsBot,
  onImageReady,
  onGuess,
  onBack,
}: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const readySentForSeq = useRef(-1);

  const imgOpacity = useRef(new Animated.Value(0)).current;
  const imgScale = useRef(new Animated.Value(0.88)).current;
  const topBarOpacity = useRef(new Animated.Value(1)).current;
  const topBarY = useRef(new Animated.Value(0)).current;
  const loadPulse = useRef(new Animated.Value(0.5)).current;

  const questionKey = useMemo(() => `${roundSeq}-${question.id}`, [roundSeq, question.id]);

  useEffect(() => {
    setPicked(null);
    setLocked(false);
    setImageError(null);
  }, [questionKey]);

  useEffect(() => {
    if (imageRevealed) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(loadPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(loadPulse, { toValue: 0.38, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [imageRevealed, loadPulse]);

  useEffect(() => {
    if (!imageRevealed) return;
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
  }, [imageRevealed, questionKey, imgOpacity, imgScale, topBarOpacity, topBarY]);

  useEffect(() => {
    if (imageRevealed || readySentForSeq.current === roundSeq) return;
    let cancelled = false;
    const uri = fullImageUrl(question.image_url);
    const fireReady = () => {
      if (cancelled || readySentForSeq.current === roundSeq) return;
      readySentForSeq.current = roundSeq;
      onImageReady();
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const img = new window.Image();
      img.onload = fireReady;
      img.onerror = fireReady;
      img.src = uri;
    } else {
      Image.prefetch(uri)
        .then(fireReady)
        .catch(fireReady);
    }
    return () => {
      cancelled = true;
    };
  }, [question.id, question.image_url, roundSeq, imageRevealed, onImageReady]);

  const handlePick = useCallback(
    (choice: string) => {
      if (locked || myWrongThisRound || !imageRevealed) return;
      setLocked(true);
      setPicked(choice);
      onGuess(choice);
    },
    [locked, myWrongThisRound, imageRevealed, onGuess]
  );

  const imageUri = useMemo(() => fullImageUrl(question.image_url), [question.image_url]);
  useEffect(() => {
    setImageError(null);
  }, [imageUri]);

  const canPick = imageRevealed && !myWrongThisRound;

  return (
    <ImageBackground
      source={require("../assets/game-background.png")}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.bgOverlay}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View
            style={[styles.topBar, { opacity: topBarOpacity, transform: [{ translateY: topBarY }] }]}
          >
            <Text style={styles.topBarText}>
              You {myPoints}/{pointsToWin}
            </Text>
            <Text style={styles.topBarMid}>Lv {endlessLevel}</Text>
            <Text style={styles.topBarTextMuted}>
              {opponentIsBot ? "Bot" : "Them"} {oppPoints}/{pointsToWin}
            </Text>
          </Animated.View>

          <Text style={styles.oppBar}>First correct wins the round · {poolLabel} pool</Text>

          {!imageRevealed ? (
            <View style={styles.hiddenStage}>
              <Animated.View style={{ opacity: loadPulse }}>
                <ActivityIndicator size="large" color="#fff" />
              </Animated.View>
              <Text style={styles.hiddenHint}>Loading the picture…</Text>
              <Text style={styles.hiddenSub}>
                {opponentIsBot
                  ? "The image appears when you and the bot have it loaded (the bot simulates a short delay)."
                  : "The image appears when both players have it fully loaded."}
              </Text>
              {Platform.OS === "web" ? (
                <img src={imageUri} alt="" style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} />
              ) : (
                <Image source={{ uri: imageUri }} style={{ width: 1, height: 1, opacity: 0 }} />
              )}
            </View>
          ) : (
            <>
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
                    <img
                      src={imageUri}
                      alt=""
                      style={imageWebStyle}
                      onError={() => setImageError(imageUri || "unknown")}
                    />
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
            </>
          )}

          <View style={styles.answers}>
            {question.options.map((opt, i) => {
              const showResult = picked !== null;
              const isCorrect = opt === question.correct_answer;
              const isWrongPick = showResult && picked === opt && opt !== question.correct_answer;
              return (
                <StaggerAnswer
                  key={opt}
                  opt={opt}
                  delay={imageRevealed ? i * 72 : 0}
                  questionKey={questionKey}
                  showResult={showResult}
                  isCorrect={isCorrect}
                  isWrongPick={isWrongPick}
                  locked={locked || !canPick}
                  onPress={() => handlePick(opt)}
                >
                  <Text style={styles.answerText}>{opt}</Text>
                </StaggerAnswer>
              );
            })}
          </View>

          {myWrongThisRound ? (
            <Text style={styles.lockedHint}>
              You missed this round — wait for {opponentIsBot ? "the bot" : "your opponent"}.
            </Text>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Leave match" style={styles.leaveBtn} onPress={onBack}>
            <Text style={styles.leaveBtnText}>Leave match</Text>
          </Pressable>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  bgOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)" },
  scrollView: { flex: 1 },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 32 },
  topBar: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 6,
  },
  topBarMid: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffecb3",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 6,
  },
  topBarTextMuted: {
    fontSize: 15,
    fontWeight: "800",
    color: "rgba(255,255,255,0.9)",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 6,
  },
  oppBar: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    color: "rgba(255,255,255,0.92)",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 4,
  },
  hiddenStage: {
    minHeight: 280,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  hiddenHint: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 6,
  },
  hiddenSub: {
    marginTop: 8,
    fontSize: 14,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 20,
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
  imageError: { marginBottom: 16, fontSize: 14, color: "#b71c1c", fontWeight: "600" },
  lockedHint: {
    marginTop: 12,
    textAlign: "center",
    color: "rgba(255,255,255,0.92)",
    fontWeight: "700",
    fontSize: 15,
  },
  leaveBtn: { marginTop: 20, alignSelf: "center", padding: 12 },
  leaveBtnText: { color: "#ffe082", fontSize: 16, fontWeight: "700" },
});
