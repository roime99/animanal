import { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FadeSlideIn } from "../components/FadeSlideIn";
import { ScalePress } from "../components/ScalePress";
import type { PlayerStats } from "../services/playerStorage";

type Props = {
  username: string;
  onUsernameChange: (value: string) => void;
  statsPreview: PlayerStats | null;
  onStart: () => Promise<void>;
  onSwitchUser: () => void;
  soundMuted: boolean;
  onToggleSoundMute: () => void;
  onOpenCase?: () => void;
  onOpenInventory?: () => void;
  onOnline1v1?: () => void;
  /** Birds, Mammals, Fish, etc. - endless filtered by hierarchy segment. */
  onHierarchyEndless?: () => void;
  /** Dev-only: server logs, run commands, hierarchy verify (roi_boi account). */
  onOpenDevConsole?: () => void;
};

export function HomeScreen({
  username,
  onUsernameChange,
  statsPreview,
  onStart,
  onSwitchUser,
  soundMuted,
  onToggleSoundMute,
  onOpenCase,
  onOpenInventory,
  onOnline1v1,
  onHierarchyEndless,
  onOpenDevConsole,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setBusy(true);
    try {
      await onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const baseOnline = statsPreview ? 300 : 200;
  const baseFamily = statsPreview ? 360 : 250;
  const baseMute = statsPreview ? 420 : 280;
  const baseStart = statsPreview ? 480 : 340;
  const baseSwitch = statsPreview ? 540 : 400;

  return (
    <ImageBackground
      source={require("../assets/menu-background.png")}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <FadeSlideIn delay={0} duration={560} fromY={28}>
          <Text style={styles.title}>Animal - Animal Trivia</Text>
        </FadeSlideIn>
        <FadeSlideIn delay={80} duration={520} fromY={18}>
          <Text style={styles.subtitle}>
            Wikimedia pictures only (no app image pack). Enter a username - names are unique (case-insensitive).
          </Text>
        </FadeSlideIn>

        <FadeSlideIn delay={140} duration={480} fromY={14}>
          <Text style={styles.label}>Username</Text>
        </FadeSlideIn>
        <FadeSlideIn delay={170} duration={480} fromY={12}>
          <TextInput
            value={username}
            onChangeText={onUsernameChange}
            placeholder="Your name"
            placeholderTextColor="#bdbdbd"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            editable={!busy}
            style={styles.input}
          />
        </FadeSlideIn>

        {error ? (
          <FadeSlideIn key={error} delay={0} duration={360} fromY={8}>
            <Text style={styles.error}>{error}</Text>
          </FadeSlideIn>
        ) : null}

        {statsPreview ? (
          <FadeSlideIn key="stats" delay={220} duration={520} fromY={20} style={styles.preview}>
            <Text style={styles.previewTitle}>Saved stats</Text>
            <Text style={styles.previewLine}>Golden coins: {statsPreview.goldenCoins ?? 0}</Text>
            <Text style={styles.previewLine}>Hi score: {statsPreview.endlessHiScore}</Text>
            <Text style={styles.previewLine}>Games: {statsPreview.gamesPlayed}</Text>
            <Text style={styles.previewLine}>
              Correct / wrong: {statsPreview.totalCorrect} / {statsPreview.totalWrong}
            </Text>
            {onOpenCase && onOpenInventory ? (
              <FadeSlideIn delay={90} duration={420} fromY={14} style={styles.extraRow}>
                <ScalePress
                  accessibilityRole="button"
                  accessibilityLabel="Open animal case"
                  style={styles.smallBtn}
                  onPress={onOpenCase}
                >
                  <Text style={styles.smallBtnText}>Animal case</Text>
                </ScalePress>
                <ScalePress
                  accessibilityRole="button"
                  accessibilityLabel="Inventory"
                  style={styles.smallBtn}
                  onPress={onOpenInventory}
                >
                  <Text style={styles.smallBtnText}>Inventory</Text>
                </ScalePress>
              </FadeSlideIn>
            ) : null}
          </FadeSlideIn>
        ) : null}

        {onOnline1v1 ? (
          <FadeSlideIn delay={baseOnline} duration={460} fromY={14}>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="1v1 online"
              style={styles.onlineBtn}
              scaleTo={0.97}
              onPress={onOnline1v1}
            >
              <Text style={styles.onlineBtnText}>1 v 1 online</Text>
            </ScalePress>
          </FadeSlideIn>
        ) : null}

        {onHierarchyEndless ? (
          <FadeSlideIn delay={baseFamily} duration={440} fromY={12}>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Endless by animal group"
              style={styles.groupBtn}
              scaleTo={0.97}
              onPress={onHierarchyEndless}
              disabled={busy}
            >
              <Text style={styles.groupBtnText}>Endless by group</Text>
            </ScalePress>
          </FadeSlideIn>
        ) : null}

        {onOpenDevConsole ? (
          <FadeSlideIn delay={baseFamily + 50} duration={400} fromY={8}>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Open developer console"
              style={styles.devBtn}
              scaleTo={0.98}
              onPress={onOpenDevConsole}
              disabled={busy}
            >
              <Text style={styles.devBtnText}>Dev console</Text>
            </ScalePress>
          </FadeSlideIn>
        ) : null}

        <FadeSlideIn delay={baseMute} duration={440} fromY={12}>
          <ScalePress
            accessibilityRole="switch"
            accessibilityLabel={soundMuted ? "Unmute sound" : "Mute sound"}
            accessibilityState={{ checked: soundMuted }}
            style={styles.muteBtn}
            scaleTo={0.98}
            onPress={onToggleSoundMute}
          >
            <Text style={styles.muteText}>{soundMuted ? "Sound off" : "Sound on"}</Text>
          </ScalePress>
        </FadeSlideIn>

        <FadeSlideIn delay={baseStart} duration={480} fromY={16}>
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Start game"
            style={[styles.startBtn, busy && styles.disabled]}
            scaleTo={0.97}
            onPress={handleStart}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startText}>Endless (all animals)</Text>
            )}
          </ScalePress>
        </FadeSlideIn>

        <FadeSlideIn delay={baseSwitch} duration={440} fromY={10}>
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Switch user"
            style={styles.switchBtn}
            scaleTo={0.98}
            onPress={onSwitchUser}
            disabled={busy}
          >
            <Text style={styles.switchText}>Switch user</Text>
          </ScalePress>
        </FadeSlideIn>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(20, 12, 8, 0.55)",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
    color: "#fff8e1",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
    color: "rgba(255,248,225,0.92)",
    maxWidth: 320,
    lineHeight: 22,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 6,
  },
  label: {
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: 360,
    fontSize: 14,
    fontWeight: "700",
    color: "#ffecb3",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 2,
    borderColor: "#ffb300",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    backgroundColor: "rgba(255,255,255,0.95)",
    color: "#1b1b1b",
    marginBottom: 12,
  },
  error: {
    color: "#ffab91",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
    maxWidth: 360,
    fontWeight: "600",
  },
  preview: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,193,7,0.5)",
  },
  previewTitle: { fontWeight: "800", color: "#ffe082", marginBottom: 8 },
  previewLine: { fontSize: 14, color: "rgba(255,248,225,0.95)", marginBottom: 4 },
  extraRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, justifyContent: "center" },
  smallBtn: {
    backgroundColor: "rgba(106,27,154,0.85)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,213,79,0.55)",
  },
  smallBtnText: { color: "#ffe082", fontWeight: "800", fontSize: 14 },
  onlineBtn: {
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: "rgba(13,71,161,0.88)",
    borderWidth: 2,
    borderColor: "rgba(100,181,246,0.65)",
  },
  onlineBtnText: { color: "#e3f2fd", fontSize: 16, fontWeight: "800" },
  groupBtn: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(46,125,50,0.88)",
    borderWidth: 2,
    borderColor: "rgba(165,214,167,0.65)",
  },
  groupBtnText: { color: "#e8f5e9", fontSize: 16, fontWeight: "800" },
  devBtn: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "rgba(55, 71, 79, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(144, 164, 174, 0.45)",
  },
  devBtnText: { color: "#cfd8dc", fontSize: 14, fontWeight: "700" },
  muteBtn: {
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  muteText: { color: "rgba(255,248,225,0.95)", fontSize: 15, fontWeight: "700" },
  startBtn: {
    backgroundColor: "#ffb300",
    paddingVertical: 16,
    paddingHorizontal: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ff8f00",
    minWidth: 200,
    alignItems: "center",
  },
  startText: { color: "#3e2723", fontSize: 20, fontWeight: "800" },
  switchBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  switchText: { color: "rgba(255,248,225,0.9)", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.65 },
});
