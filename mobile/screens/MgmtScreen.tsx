import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScalePress } from "../components/ScalePress";
import { getApiBaseUrl } from "../constants/api";
import { HIERARCHY_MODE_OPTIONS } from "../constants/hierarchyModes";
import type { MgmtLogLine, MgmtStatusResponse } from "../services/mgmtApi";
import {
  fetchMgmtCommands,
  fetchMgmtLogs,
  fetchMgmtPublicInfo,
  fetchMgmtStatus,
  postMgmtPing,
  postMgmtSpawn,
  postVerifyHierarchy,
  type MgmtCommandsResponse,
} from "../services/mgmtApi";

type Props = {
  devUserNorm: string;
  onBack: () => void;
};

function levelColor(level: string): string {
  const u = level.toUpperCase();
  if (u === "ERROR" || u === "CRITICAL") return "#ffcdd2";
  if (u === "WARNING") return "#ffe0b2";
  if (u === "INFO") return "#bbdefb";
  return "rgba(200, 230, 255, 0.85)";
}

function LogRow({ item }: { item: MgmtLogLine }) {
  return (
    <View style={styles.logRow}>
      <Text style={[styles.logLevel, { color: levelColor(item.level) }]}>{item.level}</Text>
      <Text style={styles.logText} selectable>
        {item.text}
      </Text>
    </View>
  );
}

export function MgmtScreen({ devUserNorm, onBack }: Props) {
  const [status, setStatus] = useState<MgmtStatusResponse | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [lines, setLines] = useState<MgmtLogLine[]>([]);
  const [commands, setCommands] = useState<MgmtCommandsResponse | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [verifyMode, setVerifyMode] = useState(HIERARCHY_MODE_OPTIONS[0]?.id ?? "birds");
  const [busy, setBusy] = useState(false);
  const afterRef = useRef(0);
  const listRef = useRef<FlatList<MgmtLogLine>>(null);

  const refreshStatus = useCallback(async () => {
    setStatusErr(null);
    try {
      await fetchMgmtPublicInfo();
    } catch (e) {
      setStatus(null);
      const base = getApiBaseUrl();
      setStatusErr(
        `${e instanceof Error ? e.message : String(e)}\n\n` +
          `Try in a browser (same machine as the API is best):\n` +
          `• ${base}/AK-MGMT-PROBE — must show JSON with main_py path\n` +
          `• ${base}/api/mgmt/public-info — must show {"mgmt":"ok",...}\n` +
          `If both are 404, port 8000 is not this project (wrong process or never restarted). ` +
          `Run: netstat -ano | findstr :8000 then stop the other PID, then from animals_kingdom/backend: ` +
          `py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
      );
      return;
    }
    try {
      const s = await fetchMgmtStatus(devUserNorm);
      setStatus(s);
    } catch (e) {
      setStatus(null);
      setStatusErr(e instanceof Error ? e.message : String(e));
    }
  }, [devUserNorm]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetchMgmtLogs(afterRef.current, 500, devUserNorm);
        if (res.lines.length > 0) {
          setLines((prev) => {
            const next = [...prev, ...res.lines];
            return next.length > 1200 ? next.slice(-1200) : next;
          });
        }
        afterRef.current = res.max_seq;
      } catch {
        /* keep polling; connection may be down */
      }
    };
    void tick();
    const id = setInterval(tick, 1400);
    return () => clearInterval(id);
  }, [devUserNorm]);

  const openCommands = useCallback(async () => {
    setBusy(true);
    try {
      const c = await fetchMgmtCommands(devUserNorm);
      setCommands(c);
      setCommandsOpen(true);
    } catch (e) {
      Alert.alert("Commands", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [devUserNorm]);

  const onPing = useCallback(async () => {
    setBusy(true);
    try {
      await postMgmtPing(devUserNorm);
    } catch (e) {
      Alert.alert("Ping", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [devUserNorm]);

  const onVerify = useCallback(async () => {
    setBusy(true);
    try {
      const r = await postVerifyHierarchy(devUserNorm, verifyMode);
      const msg = r.ok
        ? `OK — ${r.mode} (easy / medium / hard × 10 each).`
        : `Failed: ${r.error ?? "unknown"}`;
      Alert.alert(r.ok ? "Hierarchy verify" : "Hierarchy verify failed", msg);
    } catch (e) {
      Alert.alert("Verify", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [devUserNorm, verifyMode]);

  const onSpawn = useCallback(
    (kind: "expo_web" | "uvicorn_secondary") => {
      const label = kind === "expo_web" ? "Expo web :8086" : "Second API :8001";
      Alert.alert(
        "Spawn on API host",
        `${label} — starts a detached process on the Windows machine running FastAPI. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Spawn",
            style: "default",
            onPress: async () => {
              setBusy(true);
              try {
                const r = await postMgmtSpawn(devUserNorm, kind);
                Alert.alert("Spawn", r.note ?? `pid ${r.pid ?? "?"}`);
              } catch (e) {
                Alert.alert("Spawn failed", e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      );
    },
    [devUserNorm]
  );

  const clearView = useCallback(() => {
    setLines([]);
    afterRef.current = 0;
  }, []);

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.topRow}>
        <ScalePress accessibilityRole="button" accessibilityLabel="Back" style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </ScalePress>
        <Text style={styles.screenTitle}>Dev console</Text>
        <View style={styles.backBtn} />
      </View>
      <Text style={styles.apiHint} selectable>
        API: {getApiBaseUrl()}
      </Text>
      {statusErr ? (
        <View style={styles.bannerBad}>
          <Text style={styles.bannerText}>{statusErr}</Text>
        </View>
      ) : null}
      {status ? (
        <View style={styles.cardsRow}>
          <View style={[styles.card, !status.db_exists && styles.cardBad]}>
            <Text style={styles.cardLabel}>Database</Text>
            <Text style={styles.cardVal}>{status.db_exists ? "OK" : "Missing"}</Text>
          </View>
          <View style={[styles.card, !status.images_dir_exists && styles.cardWarn]}>
            <Text style={styles.cardLabel}>Images</Text>
            <Text style={styles.cardVal}>{status.images_dir_exists ? "OK" : "No folder"}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>npx</Text>
            <Text style={styles.cardVal}>{status.npx_path ? "Found" : "—"}</Text>
          </View>
        </View>
      ) : !statusErr ? (
        <ActivityIndicator color="#fff" style={{ marginVertical: 12 }} />
      ) : null}
      {status ? (
        <Text style={styles.pathMono} selectable numberOfLines={3}>
          {status.db_path}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <ScalePress
          style={[styles.actionBtn, busy && styles.actionDisabled]}
          onPress={refreshStatus}
          disabled={busy}
        >
          <Text style={styles.actionBtnText}>Refresh status</Text>
        </ScalePress>
        <ScalePress
          style={[styles.actionBtn, busy && styles.actionDisabled]}
          onPress={onPing}
          disabled={busy}
        >
          <Text style={styles.actionBtnText}>Test log line</Text>
        </ScalePress>
        <ScalePress
          style={[styles.actionBtn, styles.actionAccent, busy && styles.actionDisabled]}
          onPress={openCommands}
          disabled={busy}
        >
          <Text style={styles.actionBtnText}>Run commands…</Text>
        </ScalePress>
      </View>

      <Text style={styles.sectionLabel}>Verify hierarchy filter</Text>
      <View style={styles.modeRow}>
        {HIERARCHY_MODE_OPTIONS.map((o) => (
          <ScalePress
            key={o.id}
            style={[styles.modeChip, verifyMode === o.id && styles.modeChipOn]}
            onPress={() => setVerifyMode(o.id)}
          >
            <Text style={[styles.modeChipText, verifyMode === o.id && styles.modeChipTextOn]}>{o.label}</Text>
          </ScalePress>
        ))}
      </View>
      <ScalePress
        style={[styles.verifyBtn, busy && styles.actionDisabled]}
        onPress={onVerify}
        disabled={busy}
      >
        <Text style={styles.verifyBtnText}>Run server verify</Text>
      </ScalePress>

      <View style={styles.spawnRow}>
        <ScalePress style={styles.spawnBtn} onPress={() => onSpawn("expo_web")}>
          <Text style={styles.spawnBtnText}>Spawn Expo web</Text>
        </ScalePress>
        <ScalePress style={styles.spawnBtn} onPress={() => onSpawn("uvicorn_secondary")}>
          <Text style={styles.spawnBtnText}>Spawn API :8001</Text>
        </ScalePress>
      </View>
      <Text style={styles.spawnHint}>Spawn only works when the API runs on Windows (your dev PC).</Text>

      <View style={styles.logHeaderRow}>
        <Text style={styles.sectionLabel}>Server logs</Text>
        <ScalePress onPress={clearView}>
          <Text style={styles.clearLink}>Clear view</Text>
        </ScalePress>
      </View>
    </View>
  );

  return (
    <ImageBackground
      source={require("../assets/menu-background.png")}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <FlatList
          ref={listRef}
          data={lines}
          keyExtractor={(item) => String(item.seq)}
          renderItem={({ item }) => <LogRow item={item} />}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      </View>

      <Modal visible={commandsOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{commands?.title ?? "Commands"}</Text>
            <Text style={styles.modalEnv} selectable>
              {commands?.env_mobile}
            </Text>
            {commands?.steps.map((s) => (
              <View key={s.name} style={styles.cmdBlock}>
                <Text style={styles.cmdName}>{s.name}</Text>
                {s.cwd ? (
                  <Text style={styles.cmdCwd} selectable>
                    cd: {s.cwd}
                  </Text>
                ) : null}
                <Text style={styles.cmdBody} selectable>
                  {s.command}
                </Text>
              </View>
            ))}
            <ScalePress style={styles.modalClose} onPress={() => setCommandsOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </ScalePress>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  overlay: { flex: 1, backgroundColor: "rgba(12, 10, 24, 0.82)" },
  listContent: { paddingBottom: 28 },
  headerBlock: { paddingHorizontal: 16, paddingTop: 8 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  backBtn: { minWidth: 72, paddingVertical: 8 },
  backBtnText: { color: "#e1bee7", fontSize: 16, fontWeight: "700" },
  screenTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  apiHint: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginBottom: 10, textAlign: "center" },
  bannerBad: {
    backgroundColor: "rgba(183, 28, 28, 0.55)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  bannerText: { color: "#ffecb3", fontSize: 13, fontWeight: "600", lineHeight: 19 },
  cardsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 10 },
  card: {
    backgroundColor: "rgba(76, 175, 80, 0.35)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    minWidth: 92,
    alignItems: "center",
  },
  cardBad: { backgroundColor: "rgba(211, 47, 47, 0.45)" },
  cardWarn: { backgroundColor: "rgba(255, 152, 0, 0.4)" },
  cardLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  cardVal: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pathMono: {
    color: "rgba(200, 230, 255, 0.85)",
    fontSize: 11,
    marginBottom: 12,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 14 },
  actionBtn: {
    backgroundColor: "rgba(103, 58, 183, 0.75)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  actionAccent: { backgroundColor: "rgba(0, 151, 167, 0.8)" },
  actionDisabled: { opacity: 0.5 },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  sectionLabel: { color: "#e1bee7", fontWeight: "800", fontSize: 14, marginBottom: 8, marginTop: 4 },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  modeChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  modeChipOn: { backgroundColor: "rgba(156, 39, 176, 0.55)", borderColor: "#ce93d8" },
  modeChipText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  modeChipTextOn: { color: "#fff" },
  verifyBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(46, 125, 50, 0.85)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(200, 230, 200, 0.5)",
  },
  verifyBtnText: { color: "#e8f5e9", fontWeight: "800", fontSize: 15 },
  spawnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 12 },
  spawnBtn: {
    backgroundColor: "rgba(255, 143, 0, 0.35)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,213,79,0.4)",
  },
  spawnBtnText: { color: "#ffe082", fontWeight: "700", fontSize: 12 },
  spawnHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  logHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 6,
  },
  clearLink: { color: "#90caf9", fontWeight: "700", fontSize: 13 },
  logRow: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  logLevel: { fontSize: 10, fontWeight: "900", marginBottom: 2 },
  logText: { color: "rgba(255,255,255,0.92)", fontSize: 12, lineHeight: 17 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 18,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  modalEnv: { color: "#b0bec5", fontSize: 12, marginBottom: 14 },
  cmdBlock: { marginBottom: 16 },
  cmdName: { color: "#ce93d8", fontWeight: "800", marginBottom: 4 },
  cmdCwd: { color: "#90caf9", fontSize: 11, marginBottom: 4 },
  cmdBody: { color: "#eceff1", fontSize: 12, lineHeight: 18 },
  modalClose: {
    marginTop: 8,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  modalCloseText: { color: "#fff", fontWeight: "800" },
});
