import { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { APP_FONT_FAMILY } from "../constants/typography";
import { FadeSlideIn } from "../components/FadeSlideIn";
import { ScalePress } from "../components/ScalePress";

type Props = {
  onSubmit: (username: string) => Promise<void>;
};

export function UsernameGateScreen({ onSubmit }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <View style={styles.content}>
          <FadeSlideIn delay={0} duration={520} fromY={16}>
            <Text style={styles.subtitle}>Choose a username to save your progress</Text>
          </FadeSlideIn>
          <FadeSlideIn delay={80} duration={480} fromY={12}>
            <Text style={styles.label}>Username</Text>
          </FadeSlideIn>
          <FadeSlideIn delay={120} duration={480} fromY={10}>
            <TextInput
              value={name}
              onChangeText={setName}
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
            <FadeSlideIn key={error} delay={0} duration={360} fromY={6}>
              <Text style={styles.error}>{error}</Text>
            </FadeSlideIn>
          ) : null}
          <FadeSlideIn delay={200} duration={480} fromY={14}>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Continue"
              style={[styles.continueBtn, busy && styles.disabled]}
              scaleTo={0.97}
              onPress={async () => {
                setError(null);
                const t = name.trim();
                if (t.length < 2) {
                  setError("Enter at least 2 characters.");
                  return;
                }
                setBusy(true);
                try {
                  await onSubmit(t);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#3e2723" />
              ) : (
                <Text style={styles.continueText}>Continue</Text>
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
  brand: {
    fontFamily: APP_FONT_FAMILY,
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    zIndex: 2,
    textAlign: "center",
    fontSize: 40,
    letterSpacing: 4,
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
    paddingTop: 56,
  },
  subtitle: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    color: "rgba(255,248,225,0.92)",
    maxWidth: 300,
    lineHeight: 22,
  },
  label: {
    fontFamily: APP_FONT_FAMILY,
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: 360,
    fontSize: 14,
    color: "#ffecb3",
    marginBottom: 6,
  },
  input: {
    fontFamily: APP_FONT_FAMILY,
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
    fontFamily: APP_FONT_FAMILY,
    color: "#ffab91",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
    maxWidth: 360,
  },
  continueBtn: {
    marginTop: 8,
    backgroundColor: "#ffb300",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ff8f00",
    minWidth: 200,
    alignItems: "center",
  },
  continueText: { fontFamily: APP_FONT_FAMILY, color: "#3e2723", fontSize: 18 },
  disabled: { opacity: 0.65 },
});
