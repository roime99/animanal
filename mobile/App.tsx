import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";

import { CaseOpenScreen } from "./screens/CaseOpenScreen";
import { HierarchyGroupScreen } from "./screens/HierarchyGroupScreen";
import { EndlessScreen } from "./screens/EndlessScreen";
import { EndlessResultsScreen } from "./screens/EndlessResultsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { MgmtScreen } from "./screens/MgmtScreen";
import { OnlineMatchScreen } from "./screens/OnlineMatchScreen";
import {
  addGoldenCoins,
  clearLastUsername,
  getLastUsernameNorm,
  getPlayer,
  loginOrCreate,
  openCaseAndRecord,
  recordEndlessGame,
  ROI_BOI_NORM,
  type InventoryEntry,
  type PlayerStats,
} from "./services/playerStorage";
import { getSoundMuted, setSoundMuted } from "./services/settingsStorage";
import { debugLog } from "./utils/debugLog";

/** This edition always uses Wikimedia embed URLs (no local `images/` folder). */
const EMBED_MODE = true;

type Route =
  | { screen: "home" }
  | { screen: "online_match" }
  | { screen: "hierarchy_group" }
  | { screen: "endless"; hierarchyMode?: string }
  | {
      screen: "endless_results";
      score: number;
      wrongThisRun: number;
      stats: PlayerStats;
      hierarchyMode?: string;
    }
  | { screen: "case" }
  | { screen: "inventory" }
  | { screen: "mgmt" };

export default function App() {
  const [route, setRoute] = useState<Route>({ screen: "home" });
  const [username, setUsername] = useState("");
  const [player, setPlayer] = useState<{ norm: string; stats: PlayerStats } | null>(null);
  const [endlessSessionId, setEndlessSessionId] = useState(0);
  const [soundMuted, setSoundMutedState] = useState(false);
  const returnRouteRef = useRef<Route>({ screen: "home" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const norm = await getLastUsernameNorm();
      if (!norm || cancelled) return;
      const p = await getPlayer(norm);
      if (p && !cancelled) {
        setUsername(p.displayName);
        setPlayer({ norm, stats: p });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await getSoundMuted();
      if (!cancelled) setSoundMutedState(m);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goHome = useCallback(() => {
    setRoute({ screen: "home" });
  }, []);

  const goOnlineMatch = useCallback(() => setRoute({ screen: "online_match" }), []);

  const toggleSoundMute = useCallback(async () => {
    const next = !soundMuted;
    setSoundMutedState(next);
    await setSoundMuted(next);
  }, [soundMuted]);

  const handleStart = useCallback(async () => {
    const r = await loginOrCreate(username);
    if (!r.ok) {
      throw new Error(r.error);
    }
    setPlayer({ norm: r.norm, stats: r.stats });
    setEndlessSessionId((x) => x + 1);
    setRoute({ screen: "endless" });
  }, [username]);

  const goHierarchyGroup = useCallback(() => setRoute({ screen: "hierarchy_group" }), []);

  const goMgmt = useCallback(() => setRoute({ screen: "mgmt" }), []);

  const usernameNorm = username.trim().toLowerCase();
  const isRoiBoiSession = player?.norm === ROI_BOI_NORM || usernameNorm === ROI_BOI_NORM;

  const handleHierarchyModePicked = useCallback(
    async (modeId: string) => {
      const r = await loginOrCreate(username);
      if (!r.ok) {
        throw new Error(r.error);
      }
      setPlayer({ norm: r.norm, stats: r.stats });
      setEndlessSessionId((x) => x + 1);
      debugLog("App", "navigate to endless with hierarchy mode (on route)", { modeId });
      setRoute({ screen: "endless", hierarchyMode: modeId });
    },
    [username]
  );

  const handleSwitchUser = useCallback(async () => {
    await clearLastUsername();
    setUsername("");
    setPlayer(null);
  }, []);

  const onFinishEndless = useCallback(
    async (score: number, wrongThisRun: number, context?: { hierarchyMode?: string }) => {
      if (!player) return;
      const updated = await recordEndlessGame(player.norm, score, wrongThisRun);
      setPlayer({ norm: player.norm, stats: updated });
      setRoute({
        screen: "endless_results",
        score,
        wrongThisRun,
        stats: updated,
        hierarchyMode: context?.hierarchyMode,
      });
    },
    [player]
  );

  const onEarnCoins = useCallback(
    async (amount: number) => {
      if (!player || amount <= 0) return;
      const updated = await addGoldenCoins(player.norm, amount);
      setPlayer({ norm: player.norm, stats: updated });
    },
    [player]
  );

  const navigateToCase = useCallback(() => {
    returnRouteRef.current = route;
    setRoute({ screen: "case" });
  }, [route]);

  const navigateToInventory = useCallback(() => {
    returnRouteRef.current = route;
    setRoute({ screen: "inventory" });
  }, [route]);

  const backFromCaseOrInventory = useCallback(() => {
    setRoute(returnRouteRef.current);
  }, []);

  const handleCaseOpen = useCallback(
    async (entry: Omit<InventoryEntry, "unboxedAt">) => {
      if (!player) return;
      const updated = await openCaseAndRecord(player.norm, entry);
      setPlayer({ norm: player.norm, stats: updated });
    },
    [player]
  );

  const onRetryEndless = useCallback(() => {
    setEndlessSessionId((x) => x + 1);
    setRoute((prev) => {
      if (prev.screen === "endless_results") {
        return { screen: "endless", hierarchyMode: prev.hierarchyMode };
      }
      return { screen: "endless" };
    });
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {route.screen === "home" && (
        <HomeScreen
          username={username}
          onUsernameChange={setUsername}
          statsPreview={player?.stats ?? null}
          onStart={handleStart}
          onSwitchUser={handleSwitchUser}
          soundMuted={soundMuted}
          onToggleSoundMute={toggleSoundMute}
          onOpenCase={player ? navigateToCase : undefined}
          onOpenInventory={player ? navigateToInventory : undefined}
          onOnline1v1={goOnlineMatch}
          onHierarchyEndless={goHierarchyGroup}
          onOpenDevConsole={isRoiBoiSession ? goMgmt : undefined}
        />
      )}
      {route.screen === "mgmt" && isRoiBoiSession && (
        <MgmtScreen devUserNorm={player?.norm ?? ROI_BOI_NORM} onBack={goHome} />
      )}
      {route.screen === "hierarchy_group" && (
        <HierarchyGroupScreen onBack={goHome} onPickMode={handleHierarchyModePicked} />
      )}
      {route.screen === "online_match" && (
        <OnlineMatchScreen onBack={goHome} soundMuted={soundMuted} />
      )}
      {route.screen === "endless" && player && (
        <EndlessScreen
          key={endlessSessionId}
          goldenCoins={player.stats.goldenCoins ?? 0}
          soundMuted={soundMuted}
          embedMode={EMBED_MODE}
          hierarchyMode={route.hierarchyMode}
          onEarnCoins={onEarnCoins}
          onFinish={onFinishEndless}
          onBack={goHome}
        />
      )}
      {route.screen === "endless_results" && (
        <EndlessResultsScreen
          score={route.score}
          wrongThisRun={route.wrongThisRun}
          stats={route.stats}
          onRetry={onRetryEndless}
          onHome={goHome}
          onOpenCase={navigateToCase}
          onOpenInventory={navigateToInventory}
        />
      )}
      {route.screen === "case" && player && (
        <CaseOpenScreen
          goldenCoins={player.stats.goldenCoins ?? 0}
          soundMuted={soundMuted}
          embedMode={EMBED_MODE}
          onOpenCase={handleCaseOpen}
          onBack={backFromCaseOrInventory}
        />
      )}
      {route.screen === "inventory" && player && (
        <InventoryScreen inventory={player.stats.inventory ?? []} onBack={backFromCaseOrInventory} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
});
