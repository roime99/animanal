import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiBaseUrl, wsUrl } from "../constants/api";
import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import type { GameQuestion } from "../services/gameApi";
import {
  fetchOnlineMatchHealth,
  isOnlineMatchBackendCurrent,
  ONLINE_MATCH_PROTOCOL_EXPECTED,
} from "../services/backendHealth";
import {
  fetchMatchCreate,
  fetchMatchJoin,
  fetchMatchLookup,
  fetchMatchOpenList,
  type MatchRole,
  type OpenMatchRow,
} from "../services/matchApi";
import {
  fetchFriends,
  requestFriend,
  sendLobbyInvite,
  type FriendRow,
} from "../services/socialApi";
import { playCoinSound } from "../services/playCoinSound";
import {
  applyOnlineMatchPayout,
  chargeOnlineMatchEntry,
  DEFAULT_ONLINE_MATCH_ENTRY_COST,
  type PlayerStatsNormalized,
} from "../services/playerStorage";
import { OnlineGameScreen } from "./OnlineGameScreen";
import { ScalePress } from "../components/ScalePress";

type Phase = "menu" | "lobby" | "game" | "results";

type LobbyGuestRow = { token: string; display_name: string; username_norm?: string | null };

type LobbyMsg = {
  type: "lobby";
  code: string;
  guest_joined: boolean;
  guest_count?: number;
  max_players?: number;
  both_connected: boolean;
  can_start: boolean;
  entry_cost?: number;
  lobby_title?: string;
  host_username_norm?: string | null;
  guest_username_norm?: string | null;
  host_display_name?: string;
  guest_display_name?: string;
  guest_list?: LobbyGuestRow[];
  /** Host + guests currently in the lobby (if server sends it). */
  players_joined?: number;
};

type RoundStartMsg = {
  type: "round_start";
  round_seq: number;
  endless_level: number;
  pool_label: string;
  question: GameQuestion;
  scores: Record<string, number>;
  player_labels: Record<string, string>;
  points_to_win: number;
  image_revealed: boolean;
};

type ImageRevealMsg = { type: "image_reveal"; round_seq: number };

type GuessResultMsg = {
  type: "guess_result";
  round_seq: number;
  wrong_key: string;
  scores: Record<string, number>;
  player_labels: Record<string, string>;
};

type RoundResultMsg = {
  type: "round_result";
  round_seq: number;
  reason: "first_correct" | "all_wrong";
  winner_key: string | null;
  correct_answer?: string;
  scores: Record<string, number>;
  player_labels: Record<string, string>;
  points_to_win: number;
};

type MatchEndMsg = {
  type: "match_end";
  scores: Record<string, number>;
  player_labels?: Record<string, string>;
  winner_key: string | null;
  points_to_win: number;
  results_by_key: Record<string, string>;
  player_count: number;
  pot_total: number;
};

type ErrMsg = { type: "error"; message: string };

/** RN / browsers use 1; avoid WebSocket.OPEN in case a polyfill omits it. */
const WS_OPEN = 1;

function isWsOpen(ws: WebSocket | null): boolean {
  return !!ws && ws.readyState === WS_OPEN;
}

function isGameQuestion(x: unknown): x is GameQuestion {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Array.isArray(o.options) &&
    o.options.length > 0 &&
    typeof o.correct_answer === "string" &&
    typeof o.image_url === "string"
  );
}

function buildScoreboardRows(
  scores: Record<string, number>,
  labels: Record<string, string>,
  myKey: string
): { label: string; points: number; isMe: boolean }[] {
  const keys = new Set([...Object.keys(scores), ...Object.keys(labels)]);
  return Array.from(keys).map((k) => ({
    label: labels[k] ?? (k === "host" ? "Host" : "Player"),
    points: scores[k] ?? 0,
    isMe: k === myKey,
  }));
}

type Props = {
  onBack: () => void;
  soundMuted: boolean;
  playerNorm: string | null;
  /** Display name for match + social sync */
  playerDisplayName: string;
  goldenCoins: number;
  onPlayerEconomyUpdate: (stats: PlayerStatsNormalized) => void;
  /** When set (e.g. accepted invite banner), auto-join this room from menu */
  autoJoinInvite?: { code: string; entry_cost: number; key: number } | null;
  onConsumedAutoJoinInvite?: () => void;
};

function hintForMatchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("pick") && m.includes("easy") && m.includes("medium") && m.includes("hard")) {
    return `${message}\n\nThat text is from an old server build. On the machine running FastAPI: Ctrl+C, then from the animals_kingdom/backend folder run:\nuvicorn main:app --reload --host 0.0.0.0 --port 8000`;
  }
  if (m.includes("difficulty must")) {
    return `${message}\n\nRestart FastAPI from the latest backend code (command above).`;
  }
  return message;
}

export function OnlineMatchScreen({
  onBack,
  soundMuted,
  playerNorm,
  playerDisplayName,
  goldenCoins,
  onPlayerEconomyUpdate,
  autoJoinInvite,
  onConsumedAutoJoinInvite,
}: Props) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [busy, setBusy] = useState(false);
  const [healthReachable, setHealthReachable] = useState<boolean | null>(null);
  const [backendProtocol, setBackendProtocol] = useState<number | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [mode, setMode] = useState<"create" | "join" | null>(null);

  const [role, setRole] = useState<MatchRole>("host");
  const [lobby, setLobby] = useState<LobbyMsg | null>(null);

  const [roundSeq, setRoundSeq] = useState(0);
  const [currentQ, setCurrentQ] = useState<GameQuestion | null>(null);
  const [endlessLevel, setEndlessLevel] = useState(1);
  const [poolLabel, setPoolLabel] = useState("");
  const [scoresByKey, setScoresByKey] = useState<Record<string, number>>({});
  const [playerLabels, setPlayerLabels] = useState<Record<string, string>>({});
  const [myScoreKey, setMyScoreKey] = useState<string>("host");
  const [pointsToWin, setPointsToWin] = useState(10);
  const [imageRevealed, setImageRevealed] = useState(false);
  const [myWrong, setMyWrong] = useState(false);

  const [myResult, setMyResult] = useState<string>("");
  const [finalScores, setFinalScores] = useState<Record<string, number>>({});
  const [finalLabels, setFinalLabels] = useState<Record<string, string>>({});
  const [potTotal, setPotTotal] = useState(0);
  const [matchPlayerCount, setMatchPlayerCount] = useState(2);

  const wsRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<MatchRole>("host");
  const myScoreKeyRef = useRef<string>("host");
  const imageReadySentRef = useRef(-1);
  const entryFeeChargedRef = useRef(false);
  const matchEntryCostRef = useRef(DEFAULT_ONLINE_MATCH_ENTRY_COST);

  const [publicLobbies, setPublicLobbies] = useState<OpenMatchRow[]>([]);
  const [createEntryCostStr, setCreateEntryCostStr] = useState(String(DEFAULT_ONLINE_MATCH_ENTRY_COST));
  const [createMaxPlayers, setCreateMaxPlayers] = useState(2);
  const [createPassword, setCreatePassword] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [passwordModalRow, setPasswordModalRow] = useState<OpenMatchRow | null>(null);
  const [modalPassword, setModalPassword] = useState("");

  const [opponentNorm, setOpponentNorm] = useState<string | null>(null);
  const [opponentDisplayName, setOpponentDisplayName] = useState("");
  const [alreadyFriends, setAlreadyFriends] = useState(false);
  const [friendsForInvite, setFriendsForInvite] = useState<FriendRow[]>([]);
  const [inviteBusyNorm, setInviteBusyNorm] = useState<string | null>(null);
  const autoJoinHandledKeyRef = useRef<number | null>(null);
  const opponentNormRef = useRef<string | null>(null);

  const tearDownWs = useCallback(() => {
    const w = wsRef.current;
    wsRef.current = null;
    try {
      w?.close();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      tearDownWs();
    };
  }, [tearDownWs]);

  useEffect(() => {
    if (phase !== "menu") return;
    let cancelled = false;
    (async () => {
      const h = await fetchOnlineMatchHealth();
      if (!cancelled) {
        setHealthReachable(h.reachable);
        setBackendProtocol(h.protocol);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "menu") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await fetchMatchOpenList();
        if (!cancelled) setPublicLobbies(list);
      } catch {
        if (!cancelled) setPublicLobbies([]);
      }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "lobby" || role !== "host" || !playerNorm || !lobby?.code) {
      setFriendsForInvite([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fr = await fetchFriends(playerNorm);
        if (!cancelled) setFriendsForInvite(fr);
      } catch {
        if (!cancelled) setFriendsForInvite([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, role, playerNorm, lobby?.code]);

  const handleMessage = useCallback(
    (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const msg = raw as { type?: string };
      if (msg.type === "lobby") {
        const lm = msg as LobbyMsg;
        setLobby(lm);
        if (typeof lm.entry_cost === "number" && lm.entry_cost > 0) {
          matchEntryCostRef.current = lm.entry_cost;
        }
        const me = roleRef.current;
        const hNorm = lm.host_username_norm ? String(lm.host_username_norm) : null;
        const hName = (lm.host_display_name || "").trim();
        const list = lm.guest_list ?? [];
        if (me === "host") {
          const firstGuest = list[0];
          const gNorm = firstGuest?.username_norm ? String(firstGuest.username_norm) : null;
          const gName = (firstGuest?.display_name || "").trim();
          if (gNorm) {
            opponentNormRef.current = gNorm;
            setOpponentNorm(gNorm);
            setOpponentDisplayName(gName || gNorm);
          } else {
            opponentNormRef.current = null;
            setOpponentNorm(null);
            setOpponentDisplayName("");
          }
        } else if (me === "guest" && hNorm) {
          opponentNormRef.current = hNorm;
          setOpponentNorm(hNorm);
          setOpponentDisplayName(hName || hNorm);
        } else {
          opponentNormRef.current = null;
          setOpponentNorm(null);
          setOpponentDisplayName("");
        }
        return;
      }
      if (msg.type === "round_start") {
        const r = msg as RoundStartMsg;
        if (!isGameQuestion(r.question)) {
          Alert.alert("Match", "Bad question payload from server — try updating the app or restarting the server.");
          return;
        }
        const applyRound = () => {
          imageReadySentRef.current = -1;
          setRoundSeq(r.round_seq);
          setCurrentQ(r.question);
          setEndlessLevel(r.endless_level);
          setPoolLabel(r.pool_label);
          setScoresByKey(r.scores && typeof r.scores === "object" ? { ...r.scores } : {});
          setPlayerLabels(r.player_labels && typeof r.player_labels === "object" ? { ...r.player_labels } : {});
          setPointsToWin(r.points_to_win ?? 10);
          setImageRevealed(!!r.image_revealed);
          setMyWrong(false);
          setPhase("game");
        };

        if (!playerNorm) {
          Alert.alert("Match", "You need to be signed in to play online.");
          tearDownWs();
          setPhase("menu");
          setLobby(null);
          setMode(null);
          return;
        }

        if (!entryFeeChargedRef.current) {
          entryFeeChargedRef.current = true;
          void chargeOnlineMatchEntry(playerNorm, matchEntryCostRef.current)
            .then((s) => {
              onPlayerEconomyUpdate(s);
              applyRound();
            })
            .catch((e) => {
              entryFeeChargedRef.current = false;
              Alert.alert("Match", e instanceof Error ? e.message : String(e));
              tearDownWs();
              setPhase("menu");
              setLobby(null);
              setMode(null);
            });
          return;
        }

        applyRound();
        return;
      }
      if (msg.type === "image_reveal") {
        setImageRevealed(true);
        return;
      }
      if (msg.type === "guess_result") {
        const r = msg as GuessResultMsg;
        setScoresByKey(r.scores && typeof r.scores === "object" ? { ...r.scores } : {});
        setPlayerLabels(r.player_labels && typeof r.player_labels === "object" ? { ...r.player_labels } : {});
        if (r.wrong_key === myScoreKeyRef.current) {
          setMyWrong(true);
        }
        return;
      }
      if (msg.type === "round_result") {
        const r = msg as RoundResultMsg;
        setScoresByKey(r.scores && typeof r.scores === "object" ? { ...r.scores } : {});
        setPlayerLabels(r.player_labels && typeof r.player_labels === "object" ? { ...r.player_labels } : {});
        setPointsToWin(r.points_to_win ?? 10);
        if (r.reason === "first_correct" && r.winner_key === myScoreKeyRef.current) {
          void playCoinSound({ muted: soundMuted });
        }
        return;
      }
      if (msg.type === "match_end") {
        const m = msg as MatchEndMsg;
        const myKey = myScoreKeyRef.current;
        const res = m.results_by_key?.[myKey] ?? "tie";
        const scores = m.scores && typeof m.scores === "object" ? { ...m.scores } : {};
        const norm = playerNorm;
        const nPlayers = typeof m.player_count === "number" ? m.player_count : 2;
        if (norm) {
          if (res === "win") {
            void playCoinSound({ muted: soundMuted });
          }
          void applyOnlineMatchPayout(norm, res === "win", matchEntryCostRef.current, nPlayers)
            .then(onPlayerEconomyUpdate)
            .catch(() => {});
        }
        const oppN = opponentNormRef.current;
        if (norm && oppN && nPlayers === 2) {
          void fetchFriends(norm).then((list) => {
            setAlreadyFriends(list.some((x) => x.norm === oppN));
          });
        } else {
          setAlreadyFriends(false);
        }
        setPointsToWin(m.points_to_win ?? 10);
        setFinalScores(scores);
        setFinalLabels(
          m.player_labels && typeof m.player_labels === "object" ? { ...m.player_labels } : {}
        );
        setPotTotal(typeof m.pot_total === "number" ? m.pot_total : matchEntryCostRef.current * nPlayers);
        setMatchPlayerCount(nPlayers);
        setMyResult(res);
        setPhase("results");
        tearDownWs();
        return;
      }
      if (msg.type === "error") {
        const e = msg as ErrMsg;
        Alert.alert("Match", hintForMatchError(e.message || "Something went wrong."));
        return;
      }
    },
    [soundMuted, tearDownWs, playerNorm, onPlayerEconomyUpdate]
  );

  const openSocket = useCallback(
    (c: string, t: string, r: MatchRole, entryCost: number) => {
      tearDownWs();
      entryFeeChargedRef.current = false;
      matchEntryCostRef.current = entryCost;
      const key = r === "host" ? "host" : t;
      myScoreKeyRef.current = key;
      setMyScoreKey(key);
      setScoresByKey({});
      setPlayerLabels({});
      const url = wsUrl(`/api/match/ws/${encodeURIComponent(c)}?token=${encodeURIComponent(t)}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as unknown;
          handleMessage(data);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        Alert.alert("Match", "Connection error. Check EXPO_PUBLIC_API_URL and that the server is reachable.");
      };
      roleRef.current = r;
      setRole(r);
      setLobby(null);
      setPhase("lobby");
    },
    [handleMessage, tearDownWs]
  );

  /** Accept invite from banner → auto-join this lobby */
  useEffect(() => {
    if (!autoJoinInvite || !playerNorm || phase !== "menu") return;
    if (autoJoinHandledKeyRef.current === autoJoinInvite.key) return;
    autoJoinHandledKeyRef.current = autoJoinInvite.key;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const info = await fetchMatchLookup(autoJoinInvite.code);
        if (cancelled) return;
        if (goldenCoins < info.entry_cost) {
          Alert.alert(
            "Match",
            `This match costs ${info.entry_cost} golden coins when it starts. You have ${goldenCoins}.`
          );
          onConsumedAutoJoinInvite?.();
          return;
        }
        if (info.has_password) {
          Alert.alert("Match", "This invite needs a password — enter it under Join with code.");
          onConsumedAutoJoinInvite?.();
          return;
        }
        const res = await fetchMatchJoin(autoJoinInvite.code, null, {
          guest_username_norm: playerNorm,
          guest_display_name: playerDisplayName,
        });
        if (cancelled) return;
        openSocket(res.code, res.token, "guest", res.entry_cost);
        setMode("join");
        onConsumedAutoJoinInvite?.();
      } catch (e) {
        Alert.alert("Match", e instanceof Error ? e.message : String(e));
        onConsumedAutoJoinInvite?.();
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    autoJoinInvite,
    goldenCoins,
    onConsumedAutoJoinInvite,
    openSocket,
    phase,
    playerDisplayName,
    playerNorm,
  ]);

  const onCreate = useCallback(async () => {
    if (!playerNorm) {
      Alert.alert("Match", "You need to be signed in to play online.");
      return;
    }
    const parsed = parseInt(createEntryCostStr.trim(), 10);
    const entry_cost =
      Number.isFinite(parsed) && parsed >= 1 ? Math.min(100_000, parsed) : DEFAULT_ONLINE_MATCH_ENTRY_COST;
    const mp = Math.max(2, Math.min(6, Math.floor(createMaxPlayers)));
    setBusy(true);
    try {
      const res = await fetchMatchCreate({
        entry_cost,
        password: createPassword.trim() || null,
        host_username_norm: playerNorm,
        host_display_name: playerDisplayName,
        max_players: mp,
      });
      openSocket(res.code, res.token, "host", res.entry_cost);
      setMode("create");
    } catch (e) {
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [openSocket, playerNorm, playerDisplayName, createEntryCostStr, createPassword, createMaxPlayers]);

  const onJoin = useCallback(async () => {
    const raw = joinInput.trim();
    if (raw.length < 4) {
      Alert.alert("Match", "Enter the match code.");
      return;
    }
    if (!playerNorm) {
      Alert.alert("Match", "You need to be signed in to play online.");
      return;
    }
    setBusy(true);
    try {
      const info = await fetchMatchLookup(raw);
      if (goldenCoins < info.entry_cost) {
        Alert.alert(
          "Match",
          `This match costs ${info.entry_cost} golden coins when it starts. You have ${goldenCoins}.`
        );
        return;
      }
      if (info.has_password && !joinPassword.trim()) {
        Alert.alert("Match", "This match is password-protected. Enter the password below.");
        return;
      }
      const res = await fetchMatchJoin(raw, joinPassword.trim() || null, {
        guest_username_norm: playerNorm,
        guest_display_name: playerDisplayName,
      });
      openSocket(res.code, res.token, "guest", res.entry_cost);
      setMode("join");
    } catch (e) {
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [joinInput, joinPassword, openSocket, goldenCoins, playerNorm, playerDisplayName]);

  const joinBattleFromList = useCallback(
    async (row: OpenMatchRow, password: string | null) => {
      if (!playerNorm) {
        Alert.alert("Match", "You need to be signed in to play online.");
        return;
      }
      if (goldenCoins < row.entry_cost) {
        Alert.alert(
          "Match",
          `This match costs ${row.entry_cost} golden coins when it starts. You have ${goldenCoins}.`
        );
        return;
      }
      setBusy(true);
      try {
        const res = await fetchMatchJoin(row.code, password, {
          guest_username_norm: playerNorm,
          guest_display_name: playerDisplayName,
        });
        openSocket(res.code, res.token, "guest", res.entry_cost);
        setMode("join");
        setPasswordModalRow(null);
        setModalPassword("");
      } catch (e) {
        Alert.alert("Match", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [goldenCoins, openSocket, playerNorm, playerDisplayName]
  );

  const startMatch = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !isWsOpen(ws)) {
      Alert.alert("Match", "Not connected — wait for “Connecting…” to finish, then try again.");
      return;
    }
    if (!playerNorm) {
      Alert.alert("Match", "You need to be signed in to play online.");
      return;
    }
    const stake = lobby?.entry_cost ?? matchEntryCostRef.current;
    if (goldenCoins < stake) {
      Alert.alert("Match", `You need ${stake} golden coins when the match starts. You have ${goldenCoins}.`);
      return;
    }
    try {
      ws.send(JSON.stringify({ type: "start_game" }));
    } catch (e) {
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    }
  }, [goldenCoins, playerNorm, lobby?.entry_cost]);

  const sendImageReady = useCallback(() => {
    if (imageReadySentRef.current === roundSeq) return;
    const ws = wsRef.current;
    if (!ws || !isWsOpen(ws)) return;
    imageReadySentRef.current = roundSeq;
    try {
      ws.send(JSON.stringify({ type: "image_ready" }));
    } catch {
      /* ignore */
    }
  }, [roundSeq]);

  const sendGuess = useCallback((choice: string) => {
    const ws = wsRef.current;
    if (!ws || !isWsOpen(ws)) return;
    try {
      ws.send(JSON.stringify({ type: "guess", choice }));
    } catch {
      /* ignore */
    }
  }, []);

  const resetToMenu = useCallback(() => {
    tearDownWs();
    entryFeeChargedRef.current = false;
    matchEntryCostRef.current = DEFAULT_ONLINE_MATCH_ENTRY_COST;
    roleRef.current = "host";
    myScoreKeyRef.current = "host";
    setMyScoreKey("host");
    imageReadySentRef.current = -1;
    opponentNormRef.current = null;
    setOpponentNorm(null);
    setOpponentDisplayName("");
    setAlreadyFriends(false);
    setPhase("menu");
    setMode(null);
    setLobby(null);
    setCurrentQ(null);
    setMyResult("");
    setFinalScores({});
    setFinalLabels({});
    setPotTotal(0);
    setMatchPlayerCount(2);
    setScoresByKey({});
    setPlayerLabels({});
    setImageRevealed(false);
    setMyWrong(false);
  }, [tearDownWs]);

  const scoreboardRows = useMemo(
    () => buildScoreboardRows(scoresByKey, playerLabels, myScoreKey),
    [scoresByKey, playerLabels, myScoreKey]
  );

  const inviteFriendToLobby = useCallback(
    async (friend: FriendRow) => {
      if (!playerNorm || !lobby?.code) return;
      setInviteBusyNorm(friend.norm);
      try {
        const cost = lobby.entry_cost ?? matchEntryCostRef.current;
        await sendLobbyInvite(playerNorm, friend.norm, lobby.code, cost, playerDisplayName);
        Alert.alert("Invite sent", `${friend.display_name || friend.norm} will see a popup at the top of the screen.`);
      } catch (e) {
        Alert.alert("Invite", e instanceof Error ? e.message : String(e));
      } finally {
        setInviteBusyNorm(null);
      }
    },
    [lobby?.code, lobby?.entry_cost, playerDisplayName, playerNorm]
  );

  const addOpponentAfterMatch = useCallback(async () => {
    if (!playerNorm || !opponentNorm) return;
    try {
      await requestFriend(playerNorm, opponentNorm);
      Alert.alert("Friends", "Friend request sent.");
      setAlreadyFriends(true);
    } catch (e) {
      Alert.alert("Friends", e instanceof Error ? e.message : String(e));
    }
  }, [opponentNorm, playerNorm]);

  if (phase === "game" && !currentQ) {
    return (
      <ImageBackground
        source={STATIC_MENU_BG}
        resizeMode="cover"
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <View style={[styles.overlay, styles.connectingBox]}>
          <ActivityIndicator size="large" color="#fff8e1" />
          <Text style={styles.connectingText}>Starting match…</Text>
          <Text style={styles.hint}>If this stays here, the server did not send a round. Check the API is running.</Text>
        </View>
      </ImageBackground>
    );
  }

  if (phase === "game" && currentQ) {
    return (
      <OnlineGameScreen
        question={currentQ}
        roundSeq={roundSeq}
        endlessLevel={endlessLevel}
        poolLabel={poolLabel}
        scoreboardRows={scoreboardRows}
        pointsToWin={pointsToWin}
        imageRevealed={imageRevealed}
        myWrongThisRound={myWrong}
        onImageReady={sendImageReady}
        onGuess={sendGuess}
        onBack={() => {
          Alert.alert("Leave match?", "You will disconnect from this game.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Leave",
              style: "destructive",
              onPress: () => {
                resetToMenu();
                onBack();
              },
            },
          ]);
        }}
      />
    );
  }

  if (phase === "results") {
    const headline =
      myResult === "win" ? "You win!" : myResult === "lose" ? "You lost" : "It's a tie!";
    const oppLabel = opponentDisplayName || opponentNorm || "Opponent";
    const showAddFriend =
      !!playerNorm &&
      !!opponentNorm &&
      opponentNorm !== playerNorm &&
      !alreadyFriends &&
      matchPlayerCount === 2;
    const standings = buildScoreboardRows(finalScores, finalLabels, myScoreKey).sort(
      (a, b) => b.points - a.points
    );
    return (
      <ImageBackground
        source={STATIC_MENU_BG}
        resizeMode="cover"
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <View style={styles.overlay}>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.resultOpp}>
            Pot {potTotal} golden coins · winner takes all · first to {pointsToWin}
          </Text>
          {standings.map((row, i) => (
            <Text key={`${row.label}-${i}`} style={styles.resultStandRow}>
              {row.label}
              {row.isMe ? " (you)" : ""}: {row.points}
            </Text>
          ))}
          {matchPlayerCount <= 2 ? <Text style={styles.resultOpp}>vs {oppLabel}</Text> : null}
          {matchPlayerCount > 2 ? (
            <Text style={styles.friendsNote}>
              Multi-player pot match — add people from Profile if you like.
            </Text>
          ) : null}
          {showAddFriend ? (
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Add opponent as friend"
              style={styles.primaryBtn}
              scaleTo={0.97}
              onPress={() => void addOpponentAfterMatch()}
            >
              <Text style={styles.primaryBtnText}>Add {oppLabel} to friends</Text>
            </ScalePress>
          ) : null}
          {!!opponentNorm && alreadyFriends ? (
            <Text style={styles.friendsNote}>You are friends with {oppLabel}</Text>
          ) : null}
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Play again"
            style={styles.primaryBtn}
            scaleTo={0.97}
            onPress={resetToMenu}
          >
            <Text style={styles.primaryBtnText}>Play again</Text>
          </ScalePress>
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Home"
            style={styles.secondaryBtn}
            scaleTo={0.98}
            onPress={() => {
              resetToMenu();
              onBack();
            }}
          >
            <Text style={styles.secondaryBtnText}>Home</Text>
          </ScalePress>
        </View>
      </ImageBackground>
    );
  }

  if (phase === "lobby") {
    if (!lobby) {
      return (
        <ImageBackground
          source={STATIC_MENU_BG}
          resizeMode="cover"
          style={styles.bg}
          imageStyle={styles.bgImage}
        >
          <View style={[styles.overlay, styles.connectingBox]}>
            <ActivityIndicator size="large" color="#fff8e1" />
            <Text style={styles.connectingText}>Connecting…</Text>
            <Pressable accessibilityRole="button" style={styles.secondaryBtn} onPress={resetToMenu}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </ImageBackground>
      );
    }
    const isHost = role === "host";
    const maxPl = lobby.max_players ?? 2;
    const joined =
      typeof lobby.players_joined === "number"
        ? lobby.players_joined
        : 1 + (lobby.guest_count ?? 0);
    let hint = "";
    if (!lobby.guest_joined) {
      hint = isHost ? "Waiting for players — share the room code or invite friends." : "Connecting…";
    } else if (!lobby.both_connected) {
      hint = "Finishing connection…";
    } else if (isHost) {
      hint = joined >= 2 ? "Everyone connected — tap Start match when ready." : "Need at least one other player.";
    } else {
      hint = "Waiting for host to start…";
    }
    return (
      <ImageBackground
        source={STATIC_MENU_BG}
        resizeMode="cover"
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          <View style={styles.overlay}>
            <Text style={styles.title}>Play online</Text>
            <Text style={styles.lobbyHeading} numberOfLines={2}>
              {lobby.lobby_title ?? "Lobby"}
            </Text>
            <Text style={styles.stakeLine}>
              Stake 🪙 {lobby.entry_cost ?? DEFAULT_ONLINE_MATCH_ENTRY_COST} each · up to{" "}
              {(lobby.entry_cost ?? DEFAULT_ONLINE_MATCH_ENTRY_COST) * maxPl} pot · {joined}/{maxPl} players · winner takes
              all
            </Text>
            <Text style={styles.codeLabel}>{isHost ? "Room code" : "You're in"}</Text>
            <Text style={styles.codeBig}>{lobby.code}</Text>
            <Text style={styles.oppName}>
              In lobby: {(lobby.host_display_name || "Host").trim() || "Host"}
              {lobby.guest_list && lobby.guest_list.length > 0
                ? `, ${lobby.guest_list.map((g) => g.display_name || g.username_norm || "Player").join(", ")}`
                : ""}
            </Text>
            <Text style={styles.hint}>{hint}</Text>
            {isHost && !lobby.guest_joined && friendsForInvite.length > 0 ? (
              <View style={styles.inviteBlock}>
                <Text style={styles.inviteTitle}>Invite a friend</Text>
                <Text style={styles.inviteHint}>
                  They see a popup at the top. They must be on your friends list. Up to {maxPl - 1} other players in this
                  room.
                </Text>
                {friendsForInvite.map((f) => (
                  <Pressable
                    key={f.norm}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.inviteRow, pressed && styles.battleRowPressed]}
                    onPress={() => void inviteFriendToLobby(f)}
                    disabled={inviteBusyNorm !== null}
                  >
                    <View style={[styles.dot, { backgroundColor: f.online ? "#66bb6a" : "#9e9e9e" }]} />
                    <Text style={styles.inviteRowText} numberOfLines={1}>
                      {f.display_name || f.norm}
                    </Text>
                    <Text style={styles.inviteRowMeta}>{inviteBusyNorm === f.norm ? "…" : "Invite"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {isHost && lobby.can_start ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start match"
                style={({ pressed }) => [styles.startMatchBtn, pressed && styles.startMatchBtnPressed]}
                onPress={startMatch}
              >
                <Text style={styles.startMatchBtnText}>Start match</Text>
              </Pressable>
            ) : null}
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.secondaryBtn}
              scaleTo={0.98}
              onPress={() => {
                tearDownWs();
                resetToMenu();
              }}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </ScalePress>
          </View>
        </ScrollView>
      </ImageBackground>
    );
  }

  const backendStale =
    healthReachable === true &&
    (backendProtocol === null || !isOnlineMatchBackendCurrent(backendProtocol));
  const healthUnreachable = healthReachable === false;

  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <Modal
        visible={passwordModalRow !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPasswordModalRow(null);
          setModalPassword("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              setPasswordModalRow(null);
              setModalPassword("");
            }}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Password</Text>
            <Text style={styles.modalSub}>
              {passwordModalRow?.lobby_title ?? "Lobby"} · 🪙 {passwordModalRow?.entry_cost} each
            </Text>
            <TextInput
              value={modalPassword}
              onChangeText={setModalPassword}
              placeholder="Password"
              placeholderTextColor="#888"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
              editable={!busy}
            />
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Join with password"
              style={[styles.primaryBtn, busy && styles.disabled]}
              scaleTo={0.97}
              onPress={() => {
                if (!passwordModalRow) return;
                void joinBattleFromList(passwordModalRow, modalPassword.trim());
              }}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#3e2723" />
              ) : (
                <Text style={styles.primaryBtnText}>Join</Text>
              )}
            </ScalePress>
            <Pressable
              accessibilityRole="button"
              style={styles.modalCancel}
              onPress={() => {
                setPasswordModalRow(null);
                setModalPassword("");
              }}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.menuScroll}
        contentContainerStyle={styles.menuScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.overlay}>
          <Text style={styles.title}>Play online</Text>
          {backendStale ? (
            <Text style={styles.backendWarn}>
              API {getApiBaseUrl()} is not the current online-match server (need protocol v{ONLINE_MATCH_PROTOCOL_EXPECTED}
              {backendProtocol === null ? "; /health has no online_match_protocol" : `; health says v${backendProtocol}`}).
              On the PC: netstat -ano | findstr :8000 — only your uvicorn should use the port. Then from animals_kingdom/backend:
              py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
            </Text>
          ) : null}
          {healthUnreachable ? (
            <Text style={styles.backendHint}>
              Could not reach /health — check EXPO_PUBLIC_API_URL and that FastAPI is running on this machine.
            </Text>
          ) : null}
          <Text style={styles.sub}>
            Same rules as solo endless (easy → medium → hard). First correct wins the round; first to 10 points wins the
            match. Each player pays the stake when the match starts; the winner takes the full pot.
          </Text>

          <Text style={styles.sectionLabel}>Public lobbies</Text>
          {publicLobbies.length === 0 ? (
            <Text style={styles.emptyList}>No public lobbies — create one or join with a code.</Text>
          ) : (
            publicLobbies.map((row) => (
              <Pressable
                key={row.code}
                accessibilityRole="button"
                accessibilityLabel={`Join ${row.lobby_title}`}
                style={({ pressed }) => [styles.battleRow, pressed && styles.battleRowPressed]}
                onPress={() => {
                  if (row.has_password) {
                    setPasswordModalRow(row);
                    setModalPassword("");
                  } else {
                    void joinBattleFromList(row, null);
                  }
                }}
                disabled={busy}
              >
                <View style={styles.battleRowMain}>
                  <Text style={styles.battleRowTitle} numberOfLines={2}>
                    {row.lobby_title || "Lobby"}
                  </Text>
                  <Text style={styles.battleRowMeta}>
                    🪙 {row.entry_cost} · {row.players_joined}/{row.max_players} · {row.has_password ? "🔒" : "open"}
                  </Text>
                </View>
                <Text style={styles.battleRowHint}>Code {row.code} · tap to join</Text>
              </Pressable>
            ))
          )}

          <Text style={styles.sectionLabel}>Create lobby</Text>
          <Text style={styles.fieldHint}>Stake (golden coins each player pays when the match starts)</Text>
          <TextInput
            value={createEntryCostStr}
            onChangeText={setCreateEntryCostStr}
            placeholder={String(DEFAULT_ONLINE_MATCH_ENTRY_COST)}
            placeholderTextColor="#9e9e9e"
            keyboardType="number-pad"
            editable={!busy}
            style={styles.smallInput}
          />
          <Text style={styles.fieldHint}>Max players in this match (2–6, including you)</Text>
          <View style={styles.maxPlayersRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease max players"
              style={({ pressed }) => [styles.maxPlayersBtn, pressed && styles.battleRowPressed]}
              onPress={() => setCreateMaxPlayers((n) => Math.max(2, n - 1))}
              disabled={busy}
            >
              <Text style={styles.maxPlayersBtnText}>−</Text>
            </Pressable>
            <Text style={styles.maxPlayersValue}>{createMaxPlayers}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase max players"
              style={({ pressed }) => [styles.maxPlayersBtn, pressed && styles.battleRowPressed]}
              onPress={() => setCreateMaxPlayers((n) => Math.min(6, n + 1))}
              disabled={busy}
            >
              <Text style={styles.maxPlayersBtnText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.fieldHint}>Password (optional — only players with the password can join)</Text>
          <TextInput
            value={createPassword}
            onChangeText={setCreatePassword}
            placeholder="Leave empty for a public battle"
            placeholderTextColor="#9e9e9e"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.smallInput}
          />
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Create lobby"
            style={[styles.primaryBtn, busy && styles.disabled]}
            scaleTo={0.97}
            onPress={onCreate}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#3e2723" />
            ) : (
              <Text style={styles.primaryBtnText}>Create lobby</Text>
            )}
          </ScalePress>

          <Text style={styles.sectionLabel}>Join with code</Text>
          <TextInput
            value={joinInput}
            onChangeText={(t) => setJoinInput(t.toUpperCase())}
            placeholder="Match code"
            placeholderTextColor="#bdbdbd"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            editable={!busy}
            style={styles.input}
          />
          <Text style={styles.fieldHint}>Password (only if the host locked the match)</Text>
          <TextInput
            value={joinPassword}
            onChangeText={setJoinPassword}
            placeholder="Optional"
            placeholderTextColor="#9e9e9e"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.smallInput}
          />
          <ScalePress
            accessibilityRole="button"
            accessibilityLabel="Join match"
            style={[styles.primaryBtn, busy && styles.disabled]}
            scaleTo={0.97}
            onPress={onJoin}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#3e2723" />
            ) : (
              <Text style={styles.primaryBtnText}>Join</Text>
            )}
          </ScalePress>

          <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.linkBtn} onPress={onBack}>
            <Text style={styles.linkText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImage: { width: "100%", height: "100%" },
  menuScroll: { flex: 1 },
  menuScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: 28,
  },
  overlay: {
    alignItems: "center",
    padding: 24,
    paddingTop: 16,
    backgroundColor: "rgba(20, 12, 8, 0.55)",
    width: "100%",
    maxWidth: 440,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fffef7",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: "#ffb300",
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#3e2723", marginBottom: 6 },
  modalSub: { fontSize: 14, color: "#5d4037", marginBottom: 14 },
  modalInput: {
    borderWidth: 2,
    borderColor: "#cfd8dc",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 14,
    color: "#1b1b1b",
  },
  modalCancel: { alignSelf: "center", paddingVertical: 10, marginTop: 4 },
  sectionLabel: {
    alignSelf: "flex-start",
    width: "100%",
    fontSize: 16,
    fontWeight: "800",
    color: "#ffecb3",
    marginTop: 18,
    marginBottom: 8,
  },
  fieldHint: {
    alignSelf: "flex-start",
    width: "100%",
    fontSize: 12,
    color: "rgba(255,248,225,0.85)",
    marginBottom: 6,
    lineHeight: 17,
  },
  emptyList: {
    fontSize: 14,
    color: "rgba(255,248,225,0.8)",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
    maxWidth: 360,
  },
  battleRow: {
    width: "100%",
    maxWidth: 360,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,224,130,0.35)",
    marginBottom: 8,
  },
  battleRowPressed: { opacity: 0.88 },
  battleRowMain: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  battleRowTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: "#fff8e1",
  },
  battleRowCode: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 4,
    color: "#fff8e1",
  },
  battleRowMeta: { fontSize: 13, fontWeight: "700", color: "#ffe082" },
  battleRowHint: { fontSize: 12, color: "rgba(255,248,225,0.7)", marginTop: 4 },
  smallInput: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 2,
    borderColor: "#ffb300",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.95)",
    color: "#1b1b1b",
    marginBottom: 12,
  },
  lobbyHeading: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff8e1",
    textAlign: "center",
    marginBottom: 8,
    maxWidth: 360,
    lineHeight: 28,
  },
  stakeLine: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffe082",
    textAlign: "center",
    marginBottom: 10,
    maxWidth: 360,
    lineHeight: 20,
  },
  maxPlayersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 12,
    width: "100%",
    maxWidth: 360,
  },
  maxPlayersBtn: {
    minWidth: 48,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,224,130,0.4)",
    alignItems: "center",
  },
  maxPlayersBtnText: { fontSize: 22, fontWeight: "900", color: "#fff8e1" },
  maxPlayersValue: { fontSize: 22, fontWeight: "900", color: "#ffe082", minWidth: 36, textAlign: "center" },
  lobbyScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
    color: "#fff8e1",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 10,
  },
  sub: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    color: "rgba(255,248,225,0.9)",
    maxWidth: 360,
    lineHeight: 20,
  },
  economyHint: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
    color: "#ffe082",
    maxWidth: 360,
    lineHeight: 19,
    fontWeight: "700",
  },
  backendWarn: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 14,
    color: "#ffccbc",
    maxWidth: 360,
    lineHeight: 19,
    fontWeight: "700",
  },
  backendHint: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
    color: "#ffecb3",
    maxWidth: 360,
    lineHeight: 18,
  },
  or: { marginVertical: 14, color: "rgba(255,248,225,0.85)", fontWeight: "700" },
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
    fontSize: 20,
    letterSpacing: 2,
    fontWeight: "800",
    backgroundColor: "rgba(255,255,255,0.95)",
    color: "#1b1b1b",
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: "#ffb300",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ff8f00",
    minWidth: 220,
    alignItems: "center",
  },
  primaryBtnText: { color: "#3e2723", fontSize: 18, fontWeight: "800" },
  secondaryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryBtnText: { color: "rgba(255,248,225,0.95)", fontSize: 16, fontWeight: "700" },
  linkBtn: { marginTop: 20, padding: 12 },
  linkText: { color: "#ffe082", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.65 },
  codeLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffecb3",
    marginBottom: 8,
  },
  codeBig: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 6,
    color: "#fff8e1",
    marginBottom: 16,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 8,
  },
  hint: {
    fontSize: 15,
    textAlign: "center",
    color: "rgba(255,248,225,0.92)",
    maxWidth: 340,
    marginBottom: 20,
    lineHeight: 22,
  },
  startMatchBtn: {
    backgroundColor: "#ffb300",
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ff8f00",
    minWidth: 220,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  startMatchBtnPressed: { opacity: 0.88 },
  startMatchBtnText: { color: "#3e2723", fontWeight: "900", fontSize: 18 },
  resultLine: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff8e1",
    marginBottom: 24,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  connectingBox: { justifyContent: "center" },
  connectingText: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "700",
    color: "rgba(255,248,225,0.95)",
  },
  resultOpp: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffe082",
    marginBottom: 8,
    textAlign: "center",
  },
  resultStandRow: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff8e1",
    marginBottom: 4,
    textAlign: "center",
  },
  friendsNote: {
    fontSize: 14,
    color: "rgba(255,248,225,0.88)",
    marginBottom: 14,
    textAlign: "center",
  },
  oppName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#c8e6c9",
    marginBottom: 10,
    textAlign: "center",
  },
  inviteBlock: {
    width: "100%",
    maxWidth: 360,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,224,130,0.35)",
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffecb3",
    marginBottom: 6,
  },
  inviteHint: {
    fontSize: 12,
    color: "rgba(255,248,225,0.8)",
    marginBottom: 10,
    lineHeight: 17,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,224,130,0.2)",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  inviteRowText: { flex: 1, fontSize: 15, fontWeight: "700", color: "#fff8e1" },
  inviteRowMeta: { fontSize: 14, fontWeight: "800", color: "#ffb300" },
});
