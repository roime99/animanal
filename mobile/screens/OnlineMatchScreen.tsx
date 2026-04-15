import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
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
import { BotMatchController } from "../services/botMatchController";
import { fetchMatchCreate, fetchMatchJoin, type MatchRole } from "../services/matchApi";
import { playCoinSound } from "../services/playCoinSound";
import {
  applyOnlineMatchPayout,
  chargeOnlineMatchEntry,
  ONLINE_MATCH_ENTRY_COST,
  ONLINE_MATCH_WIN_REWARD,
  type PlayerStatsNormalized,
} from "../services/playerStorage";
import { OnlineGameScreen } from "./OnlineGameScreen";
import { ScalePress } from "../components/ScalePress";

type Phase = "menu" | "lobby" | "game" | "results";

type LobbyMsg = {
  type: "lobby";
  code: string;
  guest_joined: boolean;
  both_connected: boolean;
  can_start: boolean;
};

type RoundStartMsg = {
  type: "round_start";
  round_seq: number;
  endless_level: number;
  pool_label: string;
  question: GameQuestion;
  host_points: number;
  guest_points: number;
  points_to_win: number;
  image_revealed: boolean;
};

type ImageRevealMsg = { type: "image_reveal"; round_seq: number };

type GuessResultMsg = {
  type: "guess_result";
  round_seq: number;
  wrong_role: "host" | "guest";
  host_points: number;
  guest_points: number;
};

type RoundResultMsg = {
  type: "round_result";
  round_seq: number;
  reason: "first_correct" | "both_wrong";
  winner: "host" | "guest" | null;
  correct_answer?: string;
  host_points: number;
  guest_points: number;
  points_to_win: number;
};

type MatchEndMsg = {
  type: "match_end";
  host_points: number;
  guest_points: number;
  points_to_win: number;
  host_result: string;
  guest_result: string;
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

type Props = {
  onBack: () => void;
  soundMuted: boolean;
  playerNorm: string | null;
  goldenCoins: number;
  onPlayerEconomyUpdate: (stats: PlayerStatsNormalized) => void;
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
  goldenCoins,
  onPlayerEconomyUpdate,
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
  const [hostPoints, setHostPoints] = useState(0);
  const [guestPoints, setGuestPoints] = useState(0);
  const [pointsToWin, setPointsToWin] = useState(10);
  const [imageRevealed, setImageRevealed] = useState(false);
  const [myWrong, setMyWrong] = useState(false);

  const [myResult, setMyResult] = useState<string>("");
  const [myPointsFinal, setMyPointsFinal] = useState(0);
  const [theirPointsFinal, setTheirPointsFinal] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const botRef = useRef<BotMatchController | null>(null);
  const roleRef = useRef<MatchRole>("host");
  const imageReadySentRef = useRef(-1);
  const entryFeeChargedRef = useRef(false);
  const isPvpRef = useRef(false);
  const [opponentIsBot, setOpponentIsBot] = useState(false);
  const [startingBot, setStartingBot] = useState(false);

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
      botRef.current?.dispose();
      botRef.current = null;
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

  const handleMessage = useCallback(
    (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const msg = raw as { type?: string };
      if (msg.type === "lobby") {
        setLobby(msg as LobbyMsg);
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
          setHostPoints(r.host_points);
          setGuestPoints(r.guest_points);
          setPointsToWin(r.points_to_win ?? 10);
          setImageRevealed(!!r.image_revealed);
          setMyWrong(false);
          setPhase("game");
        };

        if (botRef.current) {
          applyRound();
          return;
        }

        if (!playerNorm) {
          Alert.alert("Match", "Set a username on the home screen before playing online.");
          tearDownWs();
          setPhase("menu");
          setLobby(null);
          setMode(null);
          return;
        }

        if (!entryFeeChargedRef.current) {
          entryFeeChargedRef.current = true;
          void chargeOnlineMatchEntry(playerNorm)
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
        setHostPoints(r.host_points);
        setGuestPoints(r.guest_points);
        const me: MatchRole = roleRef.current;
        if (r.wrong_role === me) {
          setMyWrong(true);
        }
        return;
      }
      if (msg.type === "round_result") {
        const r = msg as RoundResultMsg;
        setHostPoints(r.host_points);
        setGuestPoints(r.guest_points);
        setPointsToWin(r.points_to_win ?? 10);
        const me = roleRef.current;
        if (r.reason === "first_correct" && r.winner === me) {
          void playCoinSound({ muted: soundMuted });
        }
        return;
      }
      if (msg.type === "match_end") {
        const m = msg as MatchEndMsg;
        const me = roleRef.current;
        const mine = me === "host" ? m.host_points : m.guest_points;
        const theirs = me === "host" ? m.guest_points : m.host_points;
        const res = me === "host" ? m.host_result : m.guest_result;
        const pvp = isPvpRef.current;
        const norm = playerNorm;
        if (pvp && norm) {
          if (res === "win") {
            void playCoinSound({ muted: soundMuted });
          }
          void applyOnlineMatchPayout(norm, res === "win")
            .then(onPlayerEconomyUpdate)
            .catch(() => {});
        }
        setPointsToWin(m.points_to_win ?? 10);
        setMyPointsFinal(mine);
        setTheirPointsFinal(theirs);
        setMyResult(res);
        setPhase("results");
        tearDownWs();
        botRef.current?.dispose();
        botRef.current = null;
        setOpponentIsBot(false);
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

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  const openSocket = useCallback(
    (c: string, t: string, r: MatchRole) => {
      tearDownWs();
      entryFeeChargedRef.current = false;
      isPvpRef.current = true;
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

  const onCreate = useCallback(async () => {
    if (!playerNorm) {
      Alert.alert("Match", "Set a username on the home screen first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchMatchCreate();
      openSocket(res.code, res.token, "host");
      setMode("create");
    } catch (e) {
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [openSocket, playerNorm]);

  const onJoin = useCallback(async () => {
    const raw = joinInput.trim();
    if (raw.length < 4) {
      Alert.alert("Match", "Enter the 6-character code from your friend.");
      return;
    }
    if (!playerNorm) {
      Alert.alert("Match", "Set a username on the home screen first.");
      return;
    }
    if (goldenCoins < ONLINE_MATCH_ENTRY_COST) {
      Alert.alert(
        "Match",
        `Online 1v1 costs ${ONLINE_MATCH_ENTRY_COST} golden coins when the match starts. You have ${goldenCoins}.`
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetchMatchJoin(raw);
      openSocket(res.code, res.token, "guest");
      setMode("join");
    } catch (e) {
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [joinInput, openSocket, goldenCoins, playerNorm]);

  const startBotMatch = useCallback(async () => {
    setStartingBot(true);
    try {
      tearDownWs();
      entryFeeChargedRef.current = false;
      isPvpRef.current = false;
      botRef.current?.dispose();
      botRef.current = null;
      roleRef.current = "host";
      setRole("host");
      setMode(null);
      setLobby(null);
      imageReadySentRef.current = -1;
      setPhase("game");
      setCurrentQ(null);
      setOpponentIsBot(true);
      const bot = new BotMatchController((msg) => {
        handleMessageRef.current?.(msg);
      });
      botRef.current = bot;
      await bot.start();
    } catch (e) {
      botRef.current?.dispose();
      botRef.current = null;
      setOpponentIsBot(false);
      setPhase("menu");
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    } finally {
      setStartingBot(false);
    }
  }, [tearDownWs]);

  const startMatch = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !isWsOpen(ws)) {
      Alert.alert("Match", "Not connected — wait for “Connecting…” to finish, then try again.");
      return;
    }
    if (!playerNorm) {
      Alert.alert("Match", "Set a username on the home screen first.");
      return;
    }
    if (goldenCoins < ONLINE_MATCH_ENTRY_COST) {
      Alert.alert(
        "Match",
        `You need ${ONLINE_MATCH_ENTRY_COST} golden coins to start. You have ${goldenCoins}.`
      );
      return;
    }
    try {
      ws.send(JSON.stringify({ type: "start_game" }));
    } catch (e) {
      Alert.alert("Match", e instanceof Error ? e.message : String(e));
    }
  }, [goldenCoins, playerNorm]);

  const sendImageReady = useCallback(() => {
    if (imageReadySentRef.current === roundSeq) return;
    const bot = botRef.current;
    if (bot) {
      imageReadySentRef.current = roundSeq;
      bot.userImageReady();
      return;
    }
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
    const bot = botRef.current;
    if (bot) {
      bot.userGuess(choice);
      return;
    }
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
    botRef.current?.dispose();
    botRef.current = null;
    setOpponentIsBot(false);
    entryFeeChargedRef.current = false;
    isPvpRef.current = false;
    roleRef.current = "host";
    imageReadySentRef.current = -1;
    setPhase("menu");
    setMode(null);
    setLobby(null);
    setCurrentQ(null);
    setMyResult("");
    setMyPointsFinal(0);
    setTheirPointsFinal(0);
    setImageRevealed(false);
    setMyWrong(false);
  }, [tearDownWs]);

  const pts =
    role === "host"
      ? { mine: hostPoints, opp: guestPoints }
      : { mine: guestPoints, opp: hostPoints };

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
        myPoints={pts.mine}
        oppPoints={pts.opp}
        pointsToWin={pointsToWin}
        imageRevealed={imageRevealed}
        myWrongThisRound={myWrong}
        opponentIsBot={opponentIsBot}
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
    return (
      <ImageBackground
        source={STATIC_MENU_BG}
        resizeMode="cover"
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <View style={styles.overlay}>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.resultLine}>
            Final: you {myPointsFinal} — opponent {theirPointsFinal} (first to {pointsToWin})
          </Text>
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
    let hint = "";
    if (!lobby.guest_joined) {
      hint = isHost ? "Waiting for your friend to enter this code on their phone…" : "Connecting…";
    } else if (!lobby.both_connected) {
      hint = "Finishing connection…";
    } else if (isHost) {
      hint = "Both connected — tap Start match.";
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
            <Text style={styles.title}>1 v 1 online</Text>
            <Text style={styles.codeLabel}>{isHost ? "Share this code" : "You're in"}</Text>
            <Text style={styles.codeBig}>{lobby.code}</Text>
            <Text style={styles.hint}>{hint}</Text>
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
      <View style={styles.overlay}>
        <Text style={styles.title}>1 v 1 online</Text>
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
          Same progressive pools as solo endless (easy → medium → hard as levels rise). No difficulty menu. Picture
          unlocks when both phones have loaded it. First correct guess scores; first to 10 points wins.
        </Text>
        <Text style={styles.economyHint}>
          Online vs a friend: {ONLINE_MATCH_ENTRY_COST} golden coins each when the match starts · winner +{ONLINE_MATCH_WIN_REWARD}{" "}
          golden coins · practice vs bot is free
        </Text>

        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Practice versus bot"
          style={[styles.botBtn, (busy || startingBot) && styles.disabled]}
          scaleTo={0.97}
          onPress={startBotMatch}
          disabled={busy || startingBot}
        >
          {startingBot ? <ActivityIndicator color="#ffecb3" /> : <Text style={styles.botBtnText}>Practice vs bot</Text>}
        </ScalePress>
        <Text style={styles.botHint}>No second device — uses the API for questions (same as solo).</Text>

        <Text style={styles.or}>play online</Text>

        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Create match"
          style={[styles.primaryBtn, busy && styles.disabled]}
          scaleTo={0.97}
          onPress={onCreate}
          disabled={busy}
        >
          {busy && mode === null ? (
            <ActivityIndicator color="#3e2723" />
          ) : (
            <Text style={styles.primaryBtnText}>Create match</Text>
          )}
        </ScalePress>

        <Text style={styles.or}>or</Text>

        <Text style={styles.label}>Join with code</Text>
        <TextInput
          value={joinInput}
          onChangeText={(t) => setJoinInput(t.toUpperCase())}
          placeholder="e.g. A1B2C3"
          placeholderTextColor="#bdbdbd"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          editable={!busy}
          style={styles.input}
        />
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Join match"
          style={[styles.primaryBtn, busy && styles.disabled]}
          scaleTo={0.97}
          onPress={onJoin}
          disabled={busy}
        >
          {busy && mode === null ? (
            <ActivityIndicator color="#3e2723" />
          ) : (
            <Text style={styles.primaryBtnText}>Join</Text>
          )}
        </ScalePress>

        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.linkBtn} onPress={onBack}>
          <Text style={styles.linkText}>Back</Text>
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
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(20, 12, 8, 0.55)",
  },
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
  botBtn: {
    marginBottom: 8,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffecb3",
    backgroundColor: "rgba(255,243,224,0.12)",
    minWidth: 220,
    alignItems: "center",
  },
  botBtnText: { color: "#fff8e1", fontSize: 17, fontWeight: "800" },
  botHint: {
    fontSize: 12,
    textAlign: "center",
    color: "rgba(255,248,225,0.75)",
    maxWidth: 340,
    marginBottom: 6,
    lineHeight: 17,
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
});
