import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { APP_FONT_FAMILY } from "../constants/typography";
import { FadeSlideIn } from "../components/FadeSlideIn";
import { ScalePress } from "../components/ScalePress";
import type { PlayerStats } from "../services/playerStorage";

type Props = {
  displayName: string;
  stats: PlayerStats;
  onOpenInventory: () => void;
  onOpenCase: () => void;
  onSwitchUser: () => void;
  onBack: () => void;
};

export function ProfileScreen({
  displayName,
  stats,
  onOpenInventory,
  onOpenCase,
  onSwitchUser,
  onBack,
}: Props) {
  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <Text style={styles.brand} accessibilityRole="header">
          ANIMANAL
        </Text>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FadeSlideIn delay={0} duration={480} fromY={12}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.name}>{displayName}</Text>
          </FadeSlideIn>

          <FadeSlideIn delay={60} duration={460} fromY={10} style={styles.card}>
            <Text style={styles.cardTitle}>Stats</Text>
            <Text style={styles.line}>🪙 Golden coins: {stats.goldenCoins ?? 0}</Text>
            <Text style={styles.line}>Hi score (endless): {stats.endlessHiScore}</Text>
            <Text style={styles.line}>Games played: {stats.gamesPlayed}</Text>
            <Text style={styles.line}>
              Correct / wrong: {stats.totalCorrect} / {stats.totalWrong}
            </Text>
            <Text style={styles.line}>Questions answered: {stats.totalAnswered}</Text>
          </FadeSlideIn>

          <FadeSlideIn delay={140} duration={440} fromY={12}>
            <View style={styles.row}>
              <ScalePress
                accessibilityRole="button"
                accessibilityLabel="Open animal case"
                style={styles.secondary}
                scaleTo={0.97}
                onPress={onOpenCase}
              >
                <Text style={styles.secondaryText}>Animal case</Text>
              </ScalePress>
              <ScalePress
                accessibilityRole="button"
                accessibilityLabel="Inventory"
                style={styles.secondary}
                scaleTo={0.97}
                onPress={onOpenInventory}
              >
                <Text style={styles.secondaryText}>Inventory</Text>
              </ScalePress>
            </View>
          </FadeSlideIn>

          <FadeSlideIn delay={200} duration={420} fromY={10}>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Switch user"
              style={styles.switchBtn}
              scaleTo={0.98}
              onPress={onSwitchUser}
            >
              <Text style={styles.switchText}>Switch user</Text>
            </ScalePress>
          </FadeSlideIn>

          <FadeSlideIn delay={260} duration={400} fromY={8}>
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
  brand: {
    fontFamily: APP_FONT_FAMILY,
    paddingTop: 12,
    paddingBottom: 8,
    textAlign: "center",
    fontSize: 32,
    letterSpacing: 3,
    color: "#fff8e1",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 10,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
  },
  title: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 26,
    color: "#ffcc80",
    marginBottom: 6,
    textAlign: "center",
  },
  name: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 20,
    color: "rgba(255,248,225,0.95)",
    textAlign: "center",
    marginBottom: 16,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    marginBottom: 16,
    width: "100%",
    maxWidth: 360,
  },
  secondary: {
    backgroundColor: "rgba(106,27,154,0.88)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,213,79,0.55)",
  },
  secondaryText: { fontFamily: APP_FONT_FAMILY, color: "#ffe082", fontSize: 16 },
  switchBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  switchText: { fontFamily: APP_FONT_FAMILY, color: "rgba(255,248,225,0.95)", fontSize: 16, textAlign: "center" },
  backBtn: { paddingVertical: 12 },
  backText: { fontFamily: APP_FONT_FAMILY, color: "#ffe082", fontSize: 17, textAlign: "center" },
});
