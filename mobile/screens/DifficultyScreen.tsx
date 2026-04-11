import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { difficultyForLevel } from "../services/gameApi";
import type { LevelNumber } from "../services/gameApi";

type Props = {
  onSelect: (level: LevelNumber) => void;
  onBack: () => void;
};

const LEVELS: LevelNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function DifficultyScreen({ onSelect, onBack }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Choose level</Text>
      {LEVELS.map((l) => (
        <Pressable
          key={l}
          accessibilityRole="button"
          accessibilityLabel={`Level ${l}`}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          onPress={() => onSelect(l)}
        >
          <Text style={styles.cardTitle}>Level {l}</Text>
          <Text style={styles.cardHint}>Difficulty: {difficultyForLevel(l)}</Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        onPress={onBack}
      >
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 48,
    backgroundColor: "#e3f2fd",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
    color: "#0d47a1",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#1565c0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  pressed: { opacity: 0.9 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#1565c0" },
  cardHint: { fontSize: 14, color: "#455a64", marginTop: 6 },
  back: {
    marginTop: 24,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  backText: { fontSize: 16, color: "#37474f", fontWeight: "600" },
});
