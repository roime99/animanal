import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  score: number;
  total: number;
  difficultyLabel: string;
  onPlayAgain: () => void;
  onChangeDifficulty: () => void;
  onHome: () => void;
};

function messageForScore(score: number, total: number): string {
  if (total <= 0) return "No questions played.";
  const ratio = score / total;
  if (ratio >= 0.9) return "Outstanding — you really know your animals!";
  if (ratio >= 0.7) return "Great job!";
  if (ratio >= 0.5) return "Not bad — keep practicing!";
  return "Tough round — try another difficulty!";
}

export function ResultsScreen({
  score,
  total,
  difficultyLabel,
  onPlayAgain,
  onChangeDifficulty,
  onHome,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Round complete</Text>
      <Text style={styles.difficulty}>{difficultyLabel}</Text>
      <Text style={styles.score}>
        {score} / {total}
      </Text>
      <Text style={styles.msg}>{messageForScore(score, total)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play again"
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        onPress={onPlayAgain}
      >
        <Text style={styles.primaryText}>Play again</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change difficulty"
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        onPress={onChangeDifficulty}
      >
        <Text style={styles.secondaryText}>Change difficulty</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Home"
        style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
        onPress={onHome}
      >
        <Text style={styles.ghostText}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff3e0",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#e65100", marginBottom: 8 },
  difficulty: { fontSize: 14, fontWeight: "700", color: "#bf360c", marginBottom: 16, letterSpacing: 1 },
  score: { fontSize: 44, fontWeight: "800", color: "#1b1b1b", marginBottom: 12 },
  msg: {
    fontSize: 16,
    textAlign: "center",
    color: "#5d4037",
    marginBottom: 28,
    maxWidth: 300,
    lineHeight: 22,
  },
  primary: {
    backgroundColor: "#fb8c00",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e65100",
    marginBottom: 12,
    minWidth: 220,
    alignItems: "center",
  },
  secondary: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ef6c00",
    marginBottom: 12,
    minWidth: 220,
    alignItems: "center",
  },
  ghost: { paddingVertical: 12, minWidth: 220, alignItems: "center" },
  pressed: { opacity: 0.88 },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  secondaryText: { color: "#e65100", fontSize: 17, fontWeight: "700" },
  ghostText: { color: "#6d4c41", fontSize: 16, fontWeight: "600" },
});
