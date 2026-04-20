import { apiUrl } from "../constants/api";
import { apiFetch } from "../utils/apiFetch";
import type { PlayerStatsNormalized } from "./playerStorage";

export type FriendRow = {
  norm: string;
  display_name: string;
  online: boolean;
  last_seen: number;
};

export type PendingInvite = {
  id: string;
  from_norm: string;
  from_display_name: string;
  room_code: string;
  entry_cost: number;
  host_display_name: string;
  created_at: number;
  expires_at: number;
};

export type IncomingFriendRequest = {
  from_norm: string;
  from_display_name: string;
  created_at: number;
};

export type PublicProfileResponse = {
  ok: boolean;
  norm: string;
  display_name: string;
  profile: Record<string, unknown>;
  updated_at: number;
};

export async function postHeartbeat(norm: string, displayName: string, stats: PlayerStatsNormalized): Promise<void> {
  const profile = {
    goldenCoins: stats.goldenCoins,
    endlessHiScore: stats.endlessHiScore,
    gamesPlayed: stats.gamesPlayed,
    totalCorrect: stats.totalCorrect,
    totalWrong: stats.totalWrong,
    totalAnswered: stats.totalAnswered,
    inventory: stats.inventory,
    lastPlayedAt: stats.lastPlayedAt,
  };
  await apiFetch(apiUrl("/api/social/heartbeat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username_norm: norm,
      display_name: displayName,
      profile,
    }),
  });
}

export async function fetchFriends(meNorm: string): Promise<FriendRow[]> {
  const q = encodeURIComponent(meNorm);
  const res = await apiFetch(apiUrl(`/api/social/friends?me=${q}`));
  const data = (await res.json()) as { friends?: FriendRow[] };
  if (!res.ok) return [];
  return Array.isArray(data.friends) ? data.friends : [];
}

export async function fetchIncomingFriendRequests(meNorm: string): Promise<IncomingFriendRequest[]> {
  const q = encodeURIComponent(meNorm);
  const res = await apiFetch(apiUrl(`/api/social/friend-requests/incoming?me=${q}`));
  const data = (await res.json()) as { requests?: IncomingFriendRequest[] };
  if (!res.ok) return [];
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function fetchPendingInvites(meNorm: string): Promise<PendingInvite[]> {
  const q = encodeURIComponent(meNorm);
  const res = await apiFetch(apiUrl(`/api/social/invites?me=${q}`));
  const data = (await res.json()) as { invites?: PendingInvite[] };
  if (!res.ok) return [];
  return Array.isArray(data.invites) ? data.invites : [];
}

export async function requestFriend(meNorm: string, targetNorm: string): Promise<void> {
  const res = await apiFetch(apiUrl("/api/social/friends/request"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ me_norm: meNorm, target_norm: targetNorm }),
  });
  const data = (await res.json()) as { detail?: unknown; message?: string };
  if (!res.ok) {
    const d = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? "");
    throw new Error(d || `HTTP ${res.status}`);
  }
}

export async function acceptFriend(meNorm: string, fromNorm: string): Promise<void> {
  const res = await apiFetch(apiUrl("/api/social/friends/accept"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ me_norm: meNorm, target_norm: fromNorm }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { detail?: string };
    throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
  }
}

export async function rejectFriendRequest(meNorm: string, fromNorm: string): Promise<void> {
  await apiFetch(apiUrl("/api/social/friends/reject"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ me_norm: meNorm, target_norm: fromNorm }),
  });
}

export async function removeFriend(meNorm: string, friendNorm: string): Promise<void> {
  const q = encodeURIComponent(meNorm);
  await apiFetch(apiUrl(`/api/social/friends/${encodeURIComponent(friendNorm)}?me=${q}`), {
    method: "DELETE",
  });
}

export async function sendLobbyInvite(
  fromNorm: string,
  toNorm: string,
  roomCode: string,
  entryCost: number,
  hostDisplayName: string
): Promise<void> {
  const res = await apiFetch(apiUrl("/api/social/invite"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from_norm: fromNorm,
      to_norm: toNorm,
      room_code: roomCode,
      entry_cost: entryCost,
      host_display_name: hostDisplayName,
    }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { detail?: string };
    throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
  }
}

export async function respondToInvite(
  meNorm: string,
  inviteId: string,
  accept: boolean
): Promise<{ room_code?: string; entry_cost?: number } | null> {
  const res = await apiFetch(apiUrl("/api/social/invite/respond"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ me_norm: meNorm, invite_id: inviteId, accept }),
  });
  const data = (await res.json()) as { match?: { room_code?: string; entry_cost?: number }; detail?: string };
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
  }
  return data.match ?? null;
}

export async function fetchPublicProfile(norm: string): Promise<PublicProfileResponse> {
  const res = await apiFetch(apiUrl(`/api/social/profile/${encodeURIComponent(norm)}`));
  const data = (await res.json()) as PublicProfileResponse & { detail?: string };
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
  }
  return data as PublicProfileResponse;
}
