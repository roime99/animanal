import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FadeSlideIn } from "../components/FadeSlideIn";
import { ScalePress } from "../components/ScalePress";
import { STATIC_MENU_BG } from "../constants/menuBackgroundAsset";
import { APP_FONT_FAMILY } from "../constants/typography";
import type { PlayerStats } from "../services/playerStorage";
import {
  acceptFriend,
  fetchFriends,
  fetchIncomingFriendRequests,
  rejectFriendRequest,
  removeFriend,
  requestFriend,
  type FriendRow,
  type IncomingFriendRequest,
} from "../services/socialApi";

type Props = {
  playerNorm: string;
  displayName: string;
  stats: PlayerStats;
  onOpenInventory: () => void;
  onOpenCase: () => void;
  onSwitchUser: () => void;
  onBack: () => void;
  onOpenFriendProfile: (friendNorm: string) => void;
};

export function ProfileScreen({
  playerNorm,
  displayName,
  stats,
  onOpenInventory,
  onOpenCase,
  onSwitchUser,
  onBack,
  onOpenFriendProfile,
}: Props) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([]);
  const [addName, setAddName] = useState("");
  const [loadingSocial, setLoadingSocial] = useState(false);

  const refreshSocial = useCallback(async () => {
    setLoadingSocial(true);
    try {
      const [f, inc] = await Promise.all([fetchFriends(playerNorm), fetchIncomingFriendRequests(playerNorm)]);
      setFriends(f);
      setIncoming(inc);
    } catch {
      setFriends([]);
      setIncoming([]);
    } finally {
      setLoadingSocial(false);
    }
  }, [playerNorm]);

  useEffect(() => {
    void refreshSocial();
  }, [refreshSocial]);

  const onSendRequest = async () => {
    const raw = addName.trim();
    if (raw.length < 2) {
      Alert.alert("Friends", "Enter a username.");
      return;
    }
    const target = raw.toLowerCase();
    if (target === playerNorm) {
      Alert.alert("Friends", "You cannot add yourself.");
      return;
    }
    try {
      await requestFriend(playerNorm, target);
      setAddName("");
      Alert.alert("Friends", "Friend request sent.");
    } catch (e) {
      Alert.alert("Friends", e instanceof Error ? e.message : String(e));
    }
  };

  const onAccept = async (fromNorm: string) => {
    try {
      await acceptFriend(playerNorm, fromNorm);
      await refreshSocial();
    } catch (e) {
      Alert.alert("Friends", e instanceof Error ? e.message : String(e));
    }
  };

  const onReject = async (fromNorm: string) => {
    try {
      await rejectFriendRequest(playerNorm, fromNorm);
      await refreshSocial();
    } catch {
      /* ignore */
    }
  };

  const onRemove = (friendNorm: string) => {
    Alert.alert("Remove friend?", `Remove ${friendNorm} from your friends?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeFriend(playerNorm, friendNorm);
            await refreshSocial();
          } catch {
            /* ignore */
          }
        },
      },
    ]);
  };

  return (
    <ImageBackground
      source={STATIC_MENU_BG}
      resizeMode="cover"
      style={styles.bg}
      imageStyle={styles.bgImage}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FadeSlideIn delay={0} duration={480} fromY={12}>
            <Text style={styles.brand} accessibilityRole="header">
              ANIMANAL
            </Text>
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

          <FadeSlideIn delay={100} duration={440} fromY={10} style={styles.card}>
            <Text style={styles.cardTitle}>Friends</Text>
            <Text style={styles.hint}>
              Online status updates when friends use the app (heartbeat). Tap a friend to view profile & inventory.
            </Text>
            <TextInput
              value={addName}
              onChangeText={setAddName}
              placeholder="Friend username"
              placeholderTextColor="#888"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
              style={styles.addInput}
            />
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Send friend request"
              style={styles.addBtn}
              scaleTo={0.97}
              onPress={onSendRequest}
            >
              <Text style={styles.addBtnText}>Send friend request</Text>
            </ScalePress>

            {incoming.length > 0 ? (
              <>
                <Text style={styles.subHead}>Requests for you</Text>
                {incoming.map((r) => (
                  <View key={r.from_norm} style={styles.reqRow}>
                    <Text style={styles.friendName} numberOfLines={1}>
                      {r.from_display_name || r.from_norm}
                    </Text>
                    <View style={styles.reqBtns}>
                      <ScalePress
                        accessibilityRole="button"
                        accessibilityLabel="Decline"
                        style={styles.smallGhost}
                        scaleTo={0.96}
                        onPress={() => void onReject(r.from_norm)}
                      >
                        <Text style={styles.smallGhostText}>Decline</Text>
                      </ScalePress>
                      <ScalePress
                        accessibilityRole="button"
                        accessibilityLabel="Accept"
                        style={styles.smallOk}
                        scaleTo={0.96}
                        onPress={() => void onAccept(r.from_norm)}
                      >
                        <Text style={styles.smallOkText}>Accept</Text>
                      </ScalePress>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={styles.subHead}>Your friends {loadingSocial ? "…" : `(${friends.length})`}</Text>
            {friends.length === 0 ? (
              <Text style={styles.emptyFriends}>No friends yet — add someone above.</Text>
            ) : (
              friends.map((f) => (
                <View key={f.norm} style={styles.friendRow}>
                  <ScalePress
                    accessibilityRole="button"
                    accessibilityLabel={`Open profile ${f.display_name}`}
                    style={styles.friendTap}
                    scaleTo={0.99}
                    onPress={() => onOpenFriendProfile(f.norm)}
                  >
                    <View style={[styles.dot, { backgroundColor: f.online ? "#66bb6a" : "#9e9e9e" }]} />
                    <Text style={styles.friendName} numberOfLines={1}>
                      {f.display_name || f.norm}
                    </Text>
                    <Text style={styles.onlineHint}>{f.online ? "Online" : "Offline"}</Text>
                  </ScalePress>
                  <ScalePress
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${f.norm}`}
                    style={styles.removeX}
                    scaleTo={0.95}
                    onPress={() => onRemove(f.norm)}
                  >
                    <Text style={styles.removeXText}>✕</Text>
                  </ScalePress>
                </View>
              ))
            )}
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
  scroll: {
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
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
  hint: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 12,
    color: "rgba(255,248,225,0.8)",
    marginBottom: 10,
    lineHeight: 17,
  },
  addInput: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#ffb300",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    color: "#1b1b1b",
    marginBottom: 10,
  },
  addBtn: {
    alignSelf: "stretch",
    backgroundColor: "rgba(106,27,154,0.88)",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,213,79,0.55)",
    marginBottom: 14,
    alignItems: "center",
  },
  addBtnText: { fontFamily: APP_FONT_FAMILY, color: "#ffe082", fontSize: 16, fontWeight: "700" },
  subHead: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 14,
    color: "#ffecb3",
    marginBottom: 8,
    marginTop: 4,
    fontWeight: "700",
  },
  emptyFriends: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 13,
    color: "rgba(255,248,225,0.75)",
    fontStyle: "italic",
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  reqBtns: { flexDirection: "row", gap: 8 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
    gap: 6,
  },
  friendTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,224,130,0.25)",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  friendName: {
    flex: 1,
    fontFamily: APP_FONT_FAMILY,
    fontSize: 15,
    color: "#fff8e1",
    fontWeight: "700",
  },
  onlineHint: {
    fontFamily: APP_FONT_FAMILY,
    fontSize: 12,
    color: "rgba(255,248,225,0.75)",
    marginLeft: 6,
  },
  removeX: { padding: 8 },
  removeXText: { color: "#ffcdd2", fontSize: 18, fontWeight: "800" },
  smallGhost: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  smallGhostText: { color: "#fff8e1", fontWeight: "700", fontSize: 13 },
  smallOk: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ffb300",
    borderWidth: 2,
    borderColor: "#ff8f00",
  },
  smallOkText: { color: "#3e2723", fontWeight: "800", fontSize: 13 },
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
