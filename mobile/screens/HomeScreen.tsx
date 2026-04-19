import { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { APP_FONT_FAMILY } from "../constants/typography";
import { FadeSlideIn } from "../components/FadeSlideIn";
import { ScalePress } from "../components/ScalePress";

type Props = {
  onStart: () => Promise<void>;
  soundMuted: boolean;
  onToggleSoundMute: () => void;
  displayName: string;
  goldenCoins: number;
  onOpenProfile: () => void;
  onOnline1v1?: () => void;
  /** Birds, Mammals, Fish, etc. — endless filtered by hierarchy substring. */
  onHierarchyEndless?: () => void;
  /** Dev-only: server logs, run commands, hierarchy verify (roi_boi account). */
  onOpenDevConsole?: () => void;
};

export function HomeScreen({
  onStart,
  soundMuted,
  onToggleSoundMute,
  displayName,
  goldenCoins,
  onOpenProfile,
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

  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <View style={styles.menuHeaderRow}>
          <View style={styles.menuHeaderGutter} />
          <View style={styles.menuHeaderCenter}>
            <Text style={styles.brand} accessibilityRole="header">
              ANIMANAL
            </Text>
          </View>
          <View style={[styles.menuHeaderGutter, styles.menuHeaderGutterRight]}>
            <View style={styles.headerRightCluster}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                onPress={onOpenProfile}
                style={({ pressed }) => [styles.profileChip, pressed && styles.profileChipPressed]}
              >
                <Text style={styles.profileName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.profileCoins}>🪙 {goldenCoins}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={soundMuted ? "Unmute sound" : "Mute sound"}
                accessibilityState={{ checked: soundMuted }}
                onPress={onToggleSoundMute}
                style={({ pressed }) => [styles.muteIconBtn, pressed && styles.muteIconBtnPressed]}
              >
                <Text style={styles.muteIconOnly} allowFontScaling={false}>
                  {soundMuted ? "🔇" : "🔊"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={styles.content}>
          {error ? (
            <FadeSlideIn key={error} delay={0} duration={360} fromY={8}>
              <Text style={styles.error}>{error}</Text>
            </FadeSlideIn>
          ) : null}

          {onOnline1v1 ? (
            <FadeSlideIn delay={0} duration={460} fromY={14}>
              <ScalePress
                accessibilityRole="button"
                accessibilityLabel="Play online"
                style={styles.onlineBtn}
                scaleTo={0.97}
                onPress={onOnline1v1}
              >
                <Text style={styles.onlineBtnText}>Play online</Text>
              </ScalePress>
            </FadeSlideIn>
          ) : null}

          {onHierarchyEndless ? (
            <FadeSlideIn delay={80} duration={440} fromY={12}>
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
            <FadeSlideIn delay={140} duration={400} fromY={8}>
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

          <FadeSlideIn delay={220} duration={480} fromY={16}>
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
        </View>
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
  /** Top row: ANIMANAL centered, profile chip top-right of the main menu. */
  menuHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  menuHeaderGutter: {
    flex: 1,
    minWidth: 0,
  },
  menuHeaderGutterRight: {
    alignItems: "flex-end",
  },
  headerRightCluster: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  menuHeaderCenter: {
    flexShrink: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  profileChip: {
    maxWidth: 148,
    minWidth: 88,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,224,130,0.5)",
  },
  profileChipPressed: { opacity: 0.9 },
  profileName: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 13,
    fontWeight: "800",
    color: "#fff8e1",
    textAlign: "right",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowRadius: 4,
  },
  profileCoins: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 14,
    fontWeight: "900",
    color: "#ffe082",
    textAlign: "right",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowRadius: 6,
  },
  brand: {
    fontFamily: APP_FONT_FAMILY,
    textAlign: "center",
    fontSize: 36,
    letterSpacing: 3,
    color: "#fff8e1",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    paddingTop: 12,
  },
  error: {
    fontFamily: APP_FONT_FAMILY,
    color: "#ffab91",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    maxWidth: 360,
  },
  onlineBtn: {
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: "rgba(13,71,161,0.88)",
    borderWidth: 2,
    borderColor: "rgba(100,181,246,0.65)",
  },
  onlineBtnText: { fontFamily: APP_FONT_FAMILY, color: "#e3f2fd", fontSize: 16 },
  groupBtn: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(46,125,50,0.88)",
    borderWidth: 2,
    borderColor: "rgba(165,214,167,0.65)",
  },
  groupBtnText: { fontFamily: APP_FONT_FAMILY, color: "#e8f5e9", fontSize: 16 },
  devBtn: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "rgba(55, 71, 79, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(144, 164, 174, 0.45)",
  },
  devBtnText: { fontFamily: APP_FONT_FAMILY, color: "#cfd8dc", fontSize: 14 },
  muteIconBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 44,
    minHeight: 44,
  },
  muteIconBtnPressed: { opacity: 0.85 },
  muteIconOnly: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
  },
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
  startText: { fontFamily: APP_FONT_FAMILY, color: "#3e2723", fontSize: 20 },
  disabled: { opacity: 0.65 },
});
