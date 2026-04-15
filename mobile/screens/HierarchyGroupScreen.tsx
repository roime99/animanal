import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HIERARCHY_MODE_OPTIONS } from "../constants/hierarchyModes";
import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { ScalePress } from "../components/ScalePress";
import { debugLog } from "../utils/debugLog";

type Props = {
  onBack: () => void;
  onPickMode: (hierarchyModeId: string) => Promise<void>;
};

export function HierarchyGroupScreen({ onBack, onPickMode }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRow = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      debugLog("HierarchyGroupScreen", "user picked mode", { hierarchyMode: id });
      try {
        await onPickMode(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [onPickMode]
  );

  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <Text style={styles.title}>Endless by group</Text>
        <Text style={styles.sub}>
          Same rules as classic endless. The API keeps only rows whose hierarchy path includes that group as a real
          folder segment (e.g. /Birds/), and wrong answers are other animals from that same filtered set.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {HIERARCHY_MODE_OPTIONS.map((opt) => (
            <ScalePress
              key={opt.id}
              accessibilityRole="button"
              accessibilityLabel={`Play ${opt.label}`}
              style={[styles.row, busyId === opt.id && styles.rowDisabled]}
              scaleTo={0.98}
              disabled={!!busyId}
              onPress={() => onRow(opt.id)}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{opt.label}</Text>
                {busyId === opt.id ? <ActivityIndicator color="#ffecb3" /> : null}
              </View>
              <Text style={styles.rowBlurb}>{opt.blurb}</Text>
            </ScalePress>
          ))}
        </ScrollView>

        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  overlay: {
    flex: 1,
    padding: 20,
    paddingTop: 12,
    backgroundColor: "rgba(20, 12, 8, 0.55)",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    color: "#fff8e1",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 8,
  },
  sub: {
    fontSize: 13,
    textAlign: "center",
    color: "rgba(255,248,225,0.88)",
    marginBottom: 14,
    lineHeight: 19,
    maxWidth: 400,
    alignSelf: "center",
  },
  error: {
    color: "#ffccbc",
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  list: { flex: 1, alignSelf: "stretch" },
  listContent: { paddingBottom: 16, gap: 10 },
  row: {
    backgroundColor: "rgba(255,243,224,0.14)",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,236,179,0.5)",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDisabled: { opacity: 0.7 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 18, fontWeight: "800", color: "#fff8e1", flex: 1, paddingRight: 8 },
  rowBlurb: { marginTop: 6, fontSize: 12, color: "rgba(255,248,225,0.78)", lineHeight: 17 },
  backBtn: { alignSelf: "center", paddingVertical: 14, paddingHorizontal: 24, marginTop: 8 },
  backText: { color: "#ffe082", fontSize: 16, fontWeight: "700" },
});
