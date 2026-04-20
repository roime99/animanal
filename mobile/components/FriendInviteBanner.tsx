import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PendingInvite } from "../services/socialApi";
import { fetchPendingInvites, respondToInvite } from "../services/socialApi";

type Props = {
  meNorm: string;
  /** Called after server accepts; parent should navigate to online match with auto-join. */
  onInviteAccepted: (payload: { code: string; entry_cost: number }) => void;
};

export function FriendInviteBanner({ meNorm, onInviteAccepted }: Props) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!meNorm) return;
    try {
      const list = await fetchPendingInvites(meNorm);
      setInvites(list);
    } catch {
      setInvites([]);
    }
  }, [meNorm]);

  useEffect(() => {
    if (!meNorm) return;
    void poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [meNorm, poll]);

  const top = invites[0];
  if (!top) return null;

  const onAccept = async () => {
    setBusyId(top.id);
    try {
      const m = await respondToInvite(meNorm, top.id, true);
      setInvites((prev) => prev.filter((x) => x.id !== top.id));
      if (m?.room_code) {
        onInviteAccepted({ code: m.room_code, entry_cost: m.entry_cost ?? 50 });
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = async () => {
    setBusyId(top.id);
    try {
      await respondToInvite(meNorm, top.id, false);
      setInvites((prev) => prev.filter((x) => x.id !== top.id));
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title} numberOfLines={1}>
        {top.from_display_name || top.from_norm} invited you to a match
      </Text>
      <Text style={styles.sub} numberOfLines={1}>
        Code {top.room_code} · 🪙 {top.entry_cost} · from {top.host_display_name || "host"}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decline invite"
          style={[styles.btn, styles.decline]}
          onPress={onDecline}
          disabled={busyId !== null}
        >
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Accept invite"
          style={[styles.btn, styles.accept]}
          onPress={onAccept}
          disabled={busyId !== null}
        >
          <Text style={styles.acceptText}>{busyId ? "…" : "Accept"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(46, 125, 50, 0.95)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#1b5e20",
  },
  title: {
    color: "#fffde7",
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 4,
  },
  sub: {
    color: "rgba(255,253,231,0.9)",
    fontSize: 13,
    marginBottom: 8,
  },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 88,
    alignItems: "center",
  },
  decline: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  declineText: { color: "#fff8e1", fontWeight: "700" },
  accept: {
    backgroundColor: "#ffeb3b",
    borderWidth: 2,
    borderColor: "#fbc02d",
  },
  acceptText: { color: "#33691e", fontWeight: "900" },
});
