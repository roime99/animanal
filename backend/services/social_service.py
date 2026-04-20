"""Friends, presence, public profile sync, and lobby invites (SQLite)."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

_lock = threading.Lock()

ONLINE_SECONDS = 45
INVITE_TTL_SECONDS = 600


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_social_db(path: Path) -> None:
    with _lock:
        conn = _connect(path)
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS presence (
                  norm TEXT PRIMARY KEY,
                  display_name TEXT NOT NULL DEFAULT '',
                  last_seen REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS profiles (
                  norm TEXT PRIMARY KEY,
                  display_name TEXT NOT NULL DEFAULT '',
                  profile_json TEXT NOT NULL DEFAULT '{}',
                  updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS friend_requests (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  from_norm TEXT NOT NULL,
                  to_norm TEXT NOT NULL,
                  created_at REAL NOT NULL,
                  UNIQUE(from_norm, to_norm)
                );
                CREATE TABLE IF NOT EXISTS friendships (
                  user_norm TEXT NOT NULL,
                  friend_norm TEXT NOT NULL,
                  created_at REAL NOT NULL,
                  PRIMARY KEY (user_norm, friend_norm)
                );
                CREATE INDEX IF NOT EXISTS idx_friends_user ON friendships(user_norm);
                CREATE TABLE IF NOT EXISTS invites (
                  id TEXT PRIMARY KEY,
                  from_norm TEXT NOT NULL,
                  to_norm TEXT NOT NULL,
                  room_code TEXT NOT NULL,
                  entry_cost INTEGER NOT NULL,
                  host_display_name TEXT NOT NULL DEFAULT '',
                  created_at REAL NOT NULL,
                  expires_at REAL NOT NULL,
                  status TEXT NOT NULL DEFAULT 'pending'
                );
                CREATE INDEX IF NOT EXISTS idx_invites_to ON invites(to_norm, status);
                """
            )
            conn.commit()
        finally:
            conn.close()


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def heartbeat(
    path: Path,
    norm: str,
    display_name: str,
    profile: dict[str, Any] | None,
) -> None:
    n = _norm(norm)
    if not n:
        return
    now = time.time()
    payload = json.dumps(profile if isinstance(profile, dict) else {}, separators=(",", ":"))
    with _lock:
        conn = _connect(path)
        try:
            conn.execute(
                "INSERT INTO presence(norm, display_name, last_seen) VALUES(?,?,?) "
                "ON CONFLICT(norm) DO UPDATE SET display_name=excluded.display_name, last_seen=excluded.last_seen",
                (n, (display_name or n)[:64], now),
            )
            conn.execute(
                "INSERT INTO profiles(norm, display_name, profile_json, updated_at) VALUES(?,?,?,?) "
                "ON CONFLICT(norm) DO UPDATE SET display_name=excluded.display_name, "
                "profile_json=excluded.profile_json, updated_at=excluded.updated_at",
                (n, (display_name or n)[:64], payload, now),
            )
            conn.commit()
        finally:
            conn.close()


def get_public_profile(path: Path, norm: str) -> dict[str, Any] | None:
    n = _norm(norm)
    if not n:
        return None
    with _lock:
        conn = _connect(path)
        try:
            row = conn.execute(
                "SELECT norm, display_name, profile_json, updated_at FROM profiles WHERE norm = ?",
                (n,),
            ).fetchone()
        finally:
            conn.close()
    if not row:
        return None
    try:
        data = json.loads(row["profile_json"] or "{}")
    except json.JSONDecodeError:
        data = {}
    return {
        "norm": row["norm"],
        "display_name": row["display_name"],
        "profile": data,
        "updated_at": row["updated_at"],
    }


def _is_online(last_seen: float | None) -> bool:
    if last_seen is None:
        return False
    return time.time() - float(last_seen) < ONLINE_SECONDS


def list_incoming_friend_requests(path: Path, me_norm: str) -> list[dict[str, Any]]:
    me = _norm(me_norm)
    if not me:
        return []
    with _lock:
        conn = _connect(path)
        try:
            rows = conn.execute(
                "SELECT from_norm, created_at FROM friend_requests WHERE to_norm = ? ORDER BY created_at DESC",
                (me,),
            ).fetchall()
            out = []
            for r in rows:
                fn = str(r["from_norm"])
                dn = conn.execute("SELECT display_name FROM presence WHERE norm = ?", (fn,)).fetchone()
                out.append(
                    {
                        "from_norm": fn,
                        "from_display_name": (dn["display_name"] if dn else fn)[:64],
                        "created_at": r["created_at"],
                    }
                )
            return out
        finally:
            conn.close()


def list_friends_me(path: Path, me_norm: str) -> list[dict[str, Any]]:
    me = _norm(me_norm)
    if not me:
        return []
    now = time.time()
    with _lock:
        conn = _connect(path)
        try:
            rows = conn.execute(
                "SELECT friend_norm FROM friendships WHERE user_norm = ? ORDER BY friend_norm",
                (me,),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                fn = str(r["friend_norm"])
                pr = conn.execute(
                    "SELECT display_name, last_seen FROM presence WHERE norm = ?",
                    (fn,),
                ).fetchone()
                disp = pr["display_name"] if pr else fn
                ls = float(pr["last_seen"]) if pr else 0.0
                out.append(
                    {
                        "norm": fn,
                        "display_name": disp,
                        "online": _is_online(ls),
                        "last_seen": ls,
                    }
                )
            return out
        finally:
            conn.close()


def request_friend(path: Path, from_norm: str, to_norm: str) -> tuple[bool, str]:
    a, b = _norm(from_norm), _norm(to_norm)
    if not a or not b:
        return False, "Invalid username."
    if a == b:
        return False, "You cannot add yourself."
    with _lock:
        conn = _connect(path)
        try:
            ex = conn.execute(
                "SELECT 1 FROM friendships WHERE user_norm = ? AND friend_norm = ?",
                (a, b),
            ).fetchone()
            if ex:
                return False, "Already friends."
            ex2 = conn.execute(
                "SELECT 1 FROM friend_requests WHERE from_norm = ? AND to_norm = ?",
                (a, b),
            ).fetchone()
            if ex2:
                return True, "Request already sent."
            ex3 = conn.execute(
                "SELECT 1 FROM friend_requests WHERE from_norm = ? AND to_norm = ?",
                (b, a),
            ).fetchone()
            if ex3:
                return False, "This player already sent you a request — accept it from the app."
            conn.execute(
                "INSERT INTO friend_requests(from_norm, to_norm, created_at) VALUES(?,?,?)",
                (a, b, time.time()),
            )
            conn.commit()
            return True, "ok"
        except sqlite3.IntegrityError:
            return True, "Request already sent."
        finally:
            conn.close()


def _delete_friendship_pair(conn: sqlite3.Connection, a: str, b: str) -> None:
    conn.execute("DELETE FROM friendships WHERE user_norm = ? AND friend_norm = ?", (a, b))
    conn.execute("DELETE FROM friendships WHERE user_norm = ? AND friend_norm = ?", (b, a))


def accept_friend_request(path: Path, me_norm: str, from_norm: str) -> tuple[bool, str]:
    me, other = _norm(me_norm), _norm(from_norm)
    if not me or not other:
        return False, "Invalid."
    with _lock:
        conn = _connect(path)
        try:
            row = conn.execute(
                "SELECT id FROM friend_requests WHERE from_norm = ? AND to_norm = ?",
                (other, me),
            ).fetchone()
            if not row:
                return False, "No pending request from that player."
            conn.execute("DELETE FROM friend_requests WHERE id = ?", (row["id"],))
            ts = time.time()
            conn.execute(
                "INSERT OR IGNORE INTO friendships(user_norm, friend_norm, created_at) VALUES(?,?,?)",
                (me, other, ts),
            )
            conn.execute(
                "INSERT OR IGNORE INTO friendships(user_norm, friend_norm, created_at) VALUES(?,?,?)",
                (other, me, ts),
            )
            conn.commit()
            return True, "ok"
        finally:
            conn.close()


def reject_friend_request(path: Path, me_norm: str, from_norm: str) -> tuple[bool, str]:
    me, other = _norm(me_norm), _norm(from_norm)
    with _lock:
        conn = _connect(path)
        try:
            conn.execute(
                "DELETE FROM friend_requests WHERE from_norm = ? AND to_norm = ?",
                (other, me),
            )
            conn.commit()
            return True, "ok"
        finally:
            conn.close()


def remove_friend(path: Path, me_norm: str, friend_norm: str) -> None:
    me, f = _norm(me_norm), _norm(friend_norm)
    if not me or not f:
        return
    with _lock:
        conn = _connect(path)
        try:
            _delete_friendship_pair(conn, me, f)
            conn.commit()
        finally:
            conn.close()


def create_invite(
    path: Path,
    from_norm: str,
    to_norm: str,
    room_code: str,
    entry_cost: int,
    host_display_name: str,
) -> tuple[bool, str, str | None]:
    a, b = _norm(from_norm), _norm(to_norm)
    if not a or not b or a == b:
        return False, "Invalid invite.", None
    code = (room_code or "").strip().upper()
    if len(code) < 4:
        return False, "Invalid room code.", None
    with _lock:
        conn = _connect(path)
        try:
            fr = conn.execute(
                "SELECT 1 FROM friendships WHERE user_norm = ? AND friend_norm = ?",
                (a, b),
            ).fetchone()
            if not fr:
                return False, "You can only invite friends.", None
            now = time.time()
            conn.execute("DELETE FROM invites WHERE expires_at < ?", (now,))
            iid = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO invites(id, from_norm, to_norm, room_code, entry_cost, host_display_name, "
                "created_at, expires_at, status) VALUES(?,?,?,?,?,?,?,?, 'pending')",
                (
                    iid,
                    a,
                    b,
                    code,
                    max(1, min(100_000, int(entry_cost))),
                    (host_display_name or a)[:64],
                    now,
                    now + INVITE_TTL_SECONDS,
                ),
            )
            conn.commit()
            return True, "ok", iid
        finally:
            conn.close()


def list_pending_invites(path: Path, me_norm: str) -> list[dict[str, Any]]:
    me = _norm(me_norm)
    if not me:
        return []
    now = time.time()
    with _lock:
        conn = _connect(path)
        try:
            conn.execute("DELETE FROM invites WHERE expires_at < ?", (now,))
            conn.commit()
            rows = conn.execute(
                "SELECT id, from_norm, room_code, entry_cost, host_display_name, created_at, expires_at "
                "FROM invites WHERE to_norm = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC",
                (me, now),
            ).fetchall()
            out = []
            for r in rows:
                fn = str(r["from_norm"])
                dn = conn.execute(
                    "SELECT display_name FROM presence WHERE norm = ?",
                    (fn,),
                ).fetchone()
                out.append(
                    {
                        "id": r["id"],
                        "from_norm": fn,
                        "from_display_name": (dn["display_name"] if dn else fn)[:64],
                        "room_code": r["room_code"],
                        "entry_cost": int(r["entry_cost"]),
                        "host_display_name": str(r["host_display_name"] or ""),
                        "created_at": r["created_at"],
                        "expires_at": r["expires_at"],
                    }
                )
            return out
        finally:
            conn.close()


def respond_invite(path: Path, me_norm: str, invite_id: str, accept: bool) -> tuple[bool, str, dict[str, Any] | None]:
    me = _norm(me_norm)
    if not me or not invite_id:
        return False, "Invalid.", None
    with _lock:
        conn = _connect(path)
        try:
            row = conn.execute(
                "SELECT * FROM invites WHERE id = ? AND to_norm = ? AND status = 'pending'",
                (invite_id, me),
            ).fetchone()
            if not row:
                return False, "Invite not found or expired.", None
            now = time.time()
            if float(row["expires_at"]) < now:
                conn.execute("UPDATE invites SET status = 'expired' WHERE id = ?", (invite_id,))
                conn.commit()
                return False, "Invite expired.", None
            if accept:
                conn.execute("UPDATE invites SET status = 'accepted' WHERE id = ?", (invite_id,))
                conn.commit()
                return True, "ok", {
                    "room_code": row["room_code"],
                    "entry_cost": int(row["entry_cost"]),
                }
            conn.execute("UPDATE invites SET status = 'declined' WHERE id = ?", (invite_id,))
            conn.commit()
            return True, "ok", None
        finally:
            conn.close()
