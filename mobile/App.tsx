import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";

import { FriendInviteBanner } from "./components/FriendInviteBanner";
import { APP_FONT_FAMILY } from "./constants/typography";
import { CaseOpenScreen } from "./screens/CaseOpenScreen";
import { HierarchyGroupScreen } from "./screens/HierarchyGroupScreen";
import { EndlessScreen } from "./screens/EndlessScreen";
import { EndlessResultsScreen } from "./screens/EndlessResultsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { FriendProfileScreen } from "./screens/FriendProfileScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { UsernameGateScreen } from "./screens/UsernameGateScreen";
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
  type PlayerStatsNormalized,
} from "./services/playerStorage";
import { postHeartbeat } from "./services/socialApi";
import { getEmbedMode, getSoundMuted, setEmbedMode, setSoundMuted } from "./services/settingsStorage";
import { applyAppFont } from "./utils/applyAppFont";
import { debugLog } from "./utils/debugLog";

type Route =
  | { screen: "loading" }
  | { screen: "username_gate" }
  | { screen: "home" }
  | { screen: "profile" }
  | { screen: "friend_profile"; friendNorm: string }
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
  const [fontsLoaded] = useFonts({
    [APP_FONT_FAMILY]: require("./assets/fonts/junegull-rg.otf"),
  });

  const [route, setRoute] = useState<Route>({ screen: "loading" });
  const [username, setUsername] = useState("");
  const [player, setPlayer] = useState<{ norm: string; stats: PlayerStats } | null>(null);
  const [endlessSessionId, setEndlessSessionId] = useState(0);
  const [soundMuted, setSoundMutedState] = useState(false);
  const [embedMode, setEmbedModeState] = useState(false);
  const returnRouteRef = useRef<Route>({ screen: "home" });
  const [pendingInviteJoin, setPendingInviteJoin] = useState<{
    code: string;
    entry_cost: number;
    key: number;
  } | null>(null);
  const inviteKeyRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const norm = await getLastUsernameNorm();
      if (cancelled) return;
      if (norm) {
        const p = await getPlayer(norm);
        if (p && !cancelled) {
          setUsername(p.displayName);
          setPlayer({ norm, stats: p });
          setRoute({ screen: "home" });
          return;
        }
      }
      if (!cancelled) setRoute({ screen: "username_gate" });
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const em = await getEmbedMode();
      if (!cancelled) setEmbedModeState(em);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Sync profile + presence for friends / public profiles */
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const p = await getPlayer(player.norm);
        if (!cancelled && p) {
          await postHeartbeat(player.norm, p.displayName, p);
        }
      } catch {
        /* offline API ok */
      }
    };
    void tick();
    const id = setInterval(tick, 25_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [player]);

  const goHome = useCallback(() => {
    setRoute({ screen: "home" });
  }, []);

  const goOnlineMatch = useCallback(() => setRoute({ screen: "online_match" }), []);

  const toggleSoundMute = useCallback(async () => {
    const next = !soundMuted;
    setSoundMutedState(next);
    await setSoundMuted(next);
  }, [soundMuted]);

  const handleUsernameGateSubmit = useCallback(async (name: string) => {
    const r = await loginOrCreate(name);
    if (!r.ok) {
      throw new Error(r.error);
    }
    setPlayer({ norm: r.norm, stats: r.stats });
    setUsername(r.stats.displayName);
    setRoute({ screen: "home" });
  }, []);

  const handleStart = useCallback(async () => {
    if (!player) return;
    const r = await loginOrCreate(player.stats.displayName);
    if (!r.ok) {
      throw new Error(r.error);
    }
    setPlayer({ norm: r.norm, stats: r.stats });
    setEndlessSessionId((x) => x + 1);
    setRoute({ screen: "endless" });
  }, [player]);

  const goHierarchyGroup = useCallback(() => setRoute({ screen: "hierarchy_group" }), []);

  const goMgmt = useCallback(() => setRoute({ screen: "mgmt" }), []);

  const usernameNorm = (player?.stats.displayName ?? username).trim().toLowerCase();
  const isRoiBoiSession = player?.norm === ROI_BOI_NORM || usernameNorm === ROI_BOI_NORM;

  const handleHierarchyModePicked = useCallback(
    async (modeId: string) => {
      if (!player) return;
      const r = await loginOrCreate(player.stats.displayName);
      if (!r.ok) {
        throw new Error(r.error);
      }
      setPlayer({ norm: r.norm, stats: r.stats });
      setEndlessSessionId((x) => x + 1);
      debugLog("App", "navigate to endless with hierarchy mode (on route)", { modeId });
      setRoute({ screen: "endless", hierarchyMode: modeId });
    },
    [player]
  );

  const handleSwitchUser = useCallback(async () => {
    await clearLastUsername();
    setUsername("");
    setPlayer(null);
    setRoute({ screen: "username_gate" });
  }, []);

  const goProfile = useCallback(() => setRoute({ screen: "profile" }), []);

  const openFriendProfile = useCallback((friendNorm: string) => {
    returnRouteRef.current = { screen: "profile" };
    setRoute({ screen: "friend_profile", friendNorm });
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

  if (!fontsLoaded || route.screen === "loading") {
    return (
      <View style={styles.fontsLoading}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  applyAppFont(APP_FONT_FAMILY);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {player && route.screen !== "username_gate" ? (
        <FriendInviteBanner
          meNorm={player.norm}
          onInviteAccepted={({ code, entry_cost }) => {
            inviteKeyRef.current += 1;
            setPendingInviteJoin({ code, entry_cost, key: inviteKeyRef.current });
            setRoute({ screen: "online_match" });
          }}
        />
      ) : null}
      {route.screen === "username_gate" && (
        <UsernameGateScreen onSubmit={handleUsernameGateSubmit} />
      )}
      {route.screen === "home" && player && (
        <HomeScreen
          onStart={handleStart}
          soundMuted={soundMuted}
          onToggleSoundMute={toggleSoundMute}
          displayName={player.stats.displayName}
          goldenCoins={player.stats.goldenCoins ?? 0}
          onOpenProfile={goProfile}
          onOnline1v1={goOnlineMatch}
          onHierarchyEndless={goHierarchyGroup}
          onOpenDevConsole={isRoiBoiSession ? goMgmt : undefined}
        />
      )}
      {route.screen === "profile" && player && (
        <ProfileScreen
          playerNorm={player.norm}
          displayName={player.stats.displayName}
          stats={player.stats}
          onOpenInventory={() => {
            returnRouteRef.current = { screen: "profile" };
            setRoute({ screen: "inventory" });
          }}
          onOpenCase={() => {
            returnRouteRef.current = { screen: "profile" };
            setRoute({ screen: "case" });
          }}
          onSwitchUser={handleSwitchUser}
          onBack={goHome}
          onOpenFriendProfile={openFriendProfile}
        />
      )}
      {route.screen === "friend_profile" && (
        <FriendProfileScreen friendNorm={route.friendNorm} onBack={() => setRoute(returnRouteRef.current)} />
      )}
      {route.screen === "mgmt" && isRoiBoiSession && (
        <MgmtScreen devUserNorm={player?.norm ?? ROI_BOI_NORM} onBack={goHome} />
      )}
      {route.screen === "hierarchy_group" && (
        <HierarchyGroupScreen onBack={goHome} onPickMode={handleHierarchyModePicked} />
      )}
      {route.screen === "online_match" && (
        <OnlineMatchScreen
          onBack={goHome}
          soundMuted={soundMuted}
          playerNorm={player?.norm ?? null}
          playerDisplayName={player?.stats.displayName ?? username}
          goldenCoins={player?.stats.goldenCoins ?? 0}
          onPlayerEconomyUpdate={(stats: PlayerStatsNormalized) => {
            setPlayer((prev) => (prev ? { norm: prev.norm, stats } : prev));
          }}
          autoJoinInvite={pendingInviteJoin}
          onConsumedAutoJoinInvite={() => setPendingInviteJoin(null)}
        />
      )}
      {route.screen === "endless" && player && (
        <EndlessScreen
          key={endlessSessionId}
          goldenCoins={player.stats.goldenCoins ?? 0}
          soundMuted={soundMuted}
          embedMode={embedMode}
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
          embedMode={embedMode}
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
  fontsLoading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fafafa" },
});
