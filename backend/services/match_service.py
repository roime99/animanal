"""Multi-player speed duels (2–6): sync image reveal, first correct scores; first to POINTS_TO_WIN wins; winner takes whole pot."""

from __future__ import annotations

import asyncio
import logging
import secrets
import string
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import WebSocket, WebSocketDisconnect

from config import settings
from services.question_service import build_formatted_game_questions

PlayerKey = str  # "host" or guest token string
Phase = Literal["lobby", "playing", "done"]
RoundPhase = Literal["loading", "revealed"]

CODE_ALPHABET = string.ascii_uppercase + string.digits

POINTS_TO_WIN = 10
# Bumped when online match contract changes; exposed on GET /health.
MATCH_PROTOCOL_VERSION = 4

log = logging.getLogger(__name__)

rooms: dict[str, "MatchRoom"] = {}


def _norm_name(s: str) -> str:
    return (s or "").strip().lower()


def _pool_difficulty_for_endless_level(endless_level: int) -> str:
    if endless_level <= 3:
        return "easy"
    if endless_level <= 6:
        return "medium"
    return "hard"


def _possessive_lobby_title(display_or_norm: str) -> str:
    base = (display_or_norm or "Host").strip() or "Host"
    return f"{base}'s Lobby"


@dataclass
class GuestSlot:
    token: str
    username_norm: str | None
    display_name: str
    ws: WebSocket | None = None


@dataclass
class MatchRoom:
    code: str
    host_token: str
    guests: dict[str, GuestSlot] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    created_at: float = field(default_factory=time.time)
    phase: Phase = "lobby"

    max_players: int = 2

    endless_level: int = 1
    seen_names: list[str] = field(default_factory=list)
    batch: list[dict[str, Any]] = field(default_factory=list)
    batch_i: int = 0

    scores: dict[str, int] = field(default_factory=dict)
    round_phase: RoundPhase = "loading"
    round_seq: int = 0
    current: dict[str, Any] | None = None
    round_resolved: bool = False
    wrong: dict[str, bool] = field(default_factory=dict)
    img_ready: dict[str, bool] = field(default_factory=dict)

    host_ws: WebSocket | None = None

    entry_cost: int = 50
    password: str | None = None

    host_username_norm: str | None = None
    host_display_name: str = ""

    def player_key_for_token(self, token: str) -> PlayerKey | None:
        if token == self.host_token:
            return "host"
        if token in self.guests:
            return token
        return None

    def all_player_keys(self) -> list[PlayerKey]:
        return ["host", *sorted(self.guests.keys())]

    def host_ws_set(self, ws: WebSocket | None) -> None:
        self.host_ws = ws

    def guest_ws_set(self, token: str, ws: WebSocket | None) -> None:
        if token in self.guests:
            self.guests[token].ws = ws


def _normalize_code(code: str) -> str:
    return (code or "").strip().upper()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _max_guests(max_players: int) -> int:
    mp = max(2, min(6, int(max_players)))
    return mp - 1


def create_room(
    entry_cost: int = 50,
    password: str | None = None,
    host_username_norm: str | None = None,
    host_display_name: str = "",
    max_players: int = 2,
) -> tuple[str, str, int, int]:
    cost = max(1, min(100_000, int(entry_cost)))
    mp = max(2, min(6, int(max_players)))
    pw = (password or "").strip() or None
    hn = (host_username_norm or "").strip().lower() or None
    hd = (host_display_name or "").strip()[:64]
    for _ in range(80):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if code not in rooms:
            room = MatchRoom(
                code=code,
                host_token=_new_token(),
                entry_cost=cost,
                password=pw,
                host_username_norm=hn,
                host_display_name=hd,
                max_players=mp,
            )
            rooms[code] = room
            return code, room.host_token, room.entry_cost, room.max_players
    raise RuntimeError("Could not allocate a room code")


def join_room(
    raw_code: str,
    password: str | None = None,
    guest_username_norm: str | None = None,
    guest_display_name: str = "",
) -> tuple[MatchRoom, str]:
    code = _normalize_code(raw_code)
    room = rooms.get(code)
    if not room:
        raise KeyError("ROOM_NOT_FOUND")
    max_g = _max_guests(room.max_players)
    if len(room.guests) >= max_g:
        raise RuntimeError("ROOM_FULL")
    if room.password is not None:
        if (password or "").strip() != room.password:
            raise RuntimeError("BAD_PASSWORD")
    token = _new_token()
    room.guests[token] = GuestSlot(
        token=token,
        username_norm=(guest_username_norm or "").strip().lower() or None,
        display_name=(guest_display_name or "").strip()[:64],
    )
    return room, token


def lookup_room(raw_code: str) -> dict[str, Any] | None:
    code = _normalize_code(raw_code)
    room = rooms.get(code)
    if not room:
        return None
    if room.phase != "lobby":
        return None
    max_g = _max_guests(room.max_players)
    if len(room.guests) >= max_g:
        return None
    return {
        "code": room.code,
        "entry_cost": room.entry_cost,
        "has_password": room.password is not None,
        "max_players": room.max_players,
        "players_joined": 1 + len(room.guests),
        "host_display_name": room.host_display_name or "",
        "lobby_title": _possessive_lobby_title(room.host_display_name or room.host_username_norm or "Host"),
    }


def list_open_rooms() -> list[dict[str, Any]]:
    """Public lobbies: lobby phase, host connected, not full."""
    out: list[dict[str, Any]] = []
    for code, room in rooms.items():
        if room.phase != "lobby" or room.host_ws is None:
            continue
        max_g = _max_guests(room.max_players)
        if len(room.guests) >= max_g:
            continue
        title = _possessive_lobby_title(room.host_display_name or room.host_username_norm or "Host")
        out.append(
            {
                "code": code,
                "entry_cost": room.entry_cost,
                "has_password": room.password is not None,
                "max_players": room.max_players,
                "players_joined": 1 + len(room.guests),
                "host_display_name": room.host_display_name or "",
                "lobby_title": title,
            }
        )
    out.sort(key=lambda x: x["lobby_title"])
    return out


def _player_labels(room: MatchRoom) -> dict[str, str]:
    labels: dict[str, str] = {"host": room.host_display_name or room.host_username_norm or "Host"}
    for tok, g in room.guests.items():
        labels[tok] = g.display_name or g.username_norm or "Player"
    return labels


async def _broadcast(room: MatchRoom, payload: dict[str, Any]) -> None:
    if room.host_ws is not None:
        try:
            await room.host_ws.send_json(payload)
        except Exception:
            pass
    for g in room.guests.values():
        if g.ws is not None:
            try:
                await g.ws.send_json(payload)
            except Exception:
                pass


async def _lobby_snapshot(room: MatchRoom) -> None:
    guest_joined = len(room.guests) > 0
    keys = room.all_player_keys()
    all_ws = room.host_ws is not None and all(g.ws is not None for g in room.guests.values())
    max_g = _max_guests(room.max_players)
    can_start = bool(
        guest_joined
        and len(room.guests) >= 1
        and all_ws
        and room.phase == "lobby"
        and len(room.guests) <= max_g
    )
    guest_list = [
        {
            "token": t,
            "display_name": g.display_name,
            "username_norm": g.username_norm,
        }
        for t, g in sorted(room.guests.items(), key=lambda x: x[0])
    ]
    await _broadcast(
        room,
        {
            "type": "lobby",
            "code": room.code,
            "guest_joined": guest_joined,
            "guest_count": len(room.guests),
            "max_players": room.max_players,
            "players_joined": 1 + len(room.guests),
            "both_connected": all_ws,
            "can_start": can_start,
            "entry_cost": room.entry_cost,
            "lobby_title": _possessive_lobby_title(room.host_display_name or room.host_username_norm or "Host"),
            "host_username_norm": room.host_username_norm,
            "guest_list": guest_list,
            "host_display_name": room.host_display_name or "",
        },
    )


async def _send_one(room: MatchRoom, player_key: PlayerKey, payload: dict[str, Any]) -> None:
    if player_key == "host":
        ws = room.host_ws
    else:
        g = room.guests.get(player_key)
        ws = g.ws if g else None
    if ws is not None:
        try:
            await ws.send_json(payload)
        except Exception:
            pass


async def _finish_match(room: MatchRoom, *, from_disconnect: bool = False) -> None:
    if room.phase == "done":
        return
    room.phase = "done"
    scores = dict(room.scores)
    keys = room.all_player_keys()
    labels = _player_labels(room)
    if not keys:
        await _broadcast(
            room,
            {
                "type": "match_end",
                "scores": scores,
                "player_labels": labels,
                "winner_key": None,
                "results_by_key": {},
                "points_to_win": POINTS_TO_WIN,
                "player_count": 0,
                "pot_total": 0,
            },
        )
        return
    if from_disconnect:
        best = max(scores.get(k, 0) for k in keys)
        tops = [k for k in keys if scores.get(k, 0) == best]
        wk = tops[0] if len(tops) == 1 else None
    else:
        hit = [k for k in keys if scores.get(k, 0) >= POINTS_TO_WIN]
        wk = hit[0] if len(hit) == 1 else (hit[0] if hit else None)
    results_by_key: dict[str, str] = {}
    for k in keys:
        if wk is None:
            results_by_key[k] = "tie"
        elif k == wk:
            results_by_key[k] = "win"
        else:
            results_by_key[k] = "lose"
    n = len(keys)
    await _broadcast(
        room,
        {
            "type": "match_end",
            "scores": scores,
            "player_labels": labels,
            "winner_key": wk,
            "points_to_win": POINTS_TO_WIN,
            "results_by_key": results_by_key,
            "player_count": n,
            "pot_total": room.entry_cost * n,
        },
    )


async def _refill_batch(room: MatchRoom) -> None:
    db_path = settings.db_path
    diff = _pool_difficulty_for_endless_level(room.endless_level)
    ex = frozenset(_norm_name(n) for n in room.seen_names if _norm_name(n))
    _lv, _label, qdicts = build_formatted_game_questions(
        db_path,
        difficulty=diff,
        level=None,
        count=10,
        exclude_animal_names=ex or None,
    )
    room.batch = qdicts
    room.batch_i = 0


async def _start_next_round(room: MatchRoom) -> None:
    if room.phase != "playing":
        return
    keys = room.all_player_keys()
    if any(room.scores.get(k, 0) >= POINTS_TO_WIN for k in keys):
        await _finish_match(room)
        return

    while room.batch_i >= len(room.batch):
        room.endless_level = min(10, room.endless_level + 1)
        await _refill_batch(room)
        if not room.batch:
            await _broadcast(room, {"type": "error", "message": "No more questions."})
            await _finish_match(room)
            return

    q = room.batch[room.batch_i]
    room.current = q
    room.round_phase = "loading"
    room.round_resolved = False
    room.wrong = {k: False for k in keys}
    room.img_ready = {k: False for k in keys}
    room.round_seq += 1

    diff_label = _pool_difficulty_for_endless_level(room.endless_level)
    labels = _player_labels(room)
    await _broadcast(
        room,
        {
            "type": "round_start",
            "round_seq": room.round_seq,
            "endless_level": room.endless_level,
            "pool_label": diff_label,
            "question": q,
            "scores": dict(room.scores),
            "player_labels": labels,
            "points_to_win": POINTS_TO_WIN,
            "image_revealed": False,
        },
    )


async def _after_round_pause(room: MatchRoom) -> None:
    await asyncio.sleep(1.55)
    await _start_next_round(room)


async def _handle_start_game(room: MatchRoom, player_key: PlayerKey, _data: dict[str, Any]) -> None:
    if player_key != "host":
        await _send_one(room, player_key, {"type": "error", "message": "Only the host can start the match."})
        return
    if room.phase != "lobby":
        await _send_one(room, player_key, {"type": "error", "message": "Match already started or finished."})
        return
    if not room.guests:
        await _send_one(room, player_key, {"type": "error", "message": "Wait for at least one player to join."})
        return
    if room.host_ws is None or any(g.ws is None for g in room.guests.values()):
        await _send_one(room, player_key, {"type": "error", "message": "Wait until everyone is connected."})
        return
    db_path = settings.db_path
    if not db_path.is_file():
        await _send_one(room, player_key, {"type": "error", "message": "Server database is not available."})
        return

    room.phase = "playing"
    room.endless_level = 1
    room.seen_names = []
    room.batch = []
    room.batch_i = 0
    keys = room.all_player_keys()
    room.scores = {k: 0 for k in keys}
    room.round_seq = 0
    room.current = None

    try:
        await _refill_batch(room)
    except ValueError as exc:
        room.phase = "lobby"
        await _send_one(room, player_key, {"type": "error", "message": str(exc)})
        return

    await _start_next_round(room)


async def _handle_image_ready(room: MatchRoom, player_key: PlayerKey) -> None:
    if room.phase != "playing" or room.round_phase != "loading" or room.round_resolved:
        return
    room.img_ready[player_key] = True
    keys = room.all_player_keys()
    if all(room.img_ready.get(k) for k in keys):
        room.round_phase = "revealed"
        await _broadcast(room, {"type": "image_reveal", "round_seq": room.round_seq})


async def _handle_guess(room: MatchRoom, player_key: PlayerKey, data: dict[str, Any]) -> None:
    if room.phase != "playing" or not room.current:
        return
    if room.round_resolved:
        return
    if room.round_phase != "revealed":
        await _send_one(room, player_key, {"type": "error", "message": "Wait until the picture is revealed."})
        return
    if room.wrong.get(player_key):
        return

    choice = str(data.get("choice") or "")
    correct = choice == str(room.current.get("correct_answer") or "")
    keys = room.all_player_keys()
    labels = _player_labels(room)

    if correct:
        room.round_resolved = True
        room.scores[player_key] = room.scores.get(player_key, 0) + 1
        key = _norm_name(str(room.current.get("correct_answer") or ""))
        if key:
            room.seen_names.append(key)
        room.batch_i += 1
        await _broadcast(
            room,
            {
                "type": "round_result",
                "round_seq": room.round_seq,
                "reason": "first_correct",
                "winner_key": player_key,
                "correct_answer": room.current.get("correct_answer"),
                "scores": dict(room.scores),
                "player_labels": labels,
                "points_to_win": POINTS_TO_WIN,
            },
        )
        if room.scores.get(player_key, 0) >= POINTS_TO_WIN:
            await _finish_match(room)
            return
        await _after_round_pause(room)
        return

    room.wrong[player_key] = True
    await _broadcast(
        room,
        {
            "type": "guess_result",
            "round_seq": room.round_seq,
            "wrong_key": player_key,
            "scores": dict(room.scores),
            "player_labels": labels,
        },
    )

    if all(room.wrong.get(k) for k in keys):
        room.round_resolved = True
        key = _norm_name(str(room.current.get("correct_answer") or ""))
        if key:
            room.seen_names.append(key)
        room.batch_i += 1
        await _broadcast(
            room,
            {
                "type": "round_result",
                "round_seq": room.round_seq,
                "reason": "all_wrong",
                "winner_key": None,
                "correct_answer": room.current.get("correct_answer"),
                "scores": dict(room.scores),
                "player_labels": labels,
                "points_to_win": POINTS_TO_WIN,
            },
        )
        await _after_round_pause(room)


async def _handle_message(room: MatchRoom, player_key: PlayerKey, data: dict[str, Any]) -> None:
    t = data.get("type")
    if t == "start_game":
        await _handle_start_game(room, player_key, data)
        return
    if t == "image_ready":
        await _handle_image_ready(room, player_key)
        return
    if t == "guess":
        await _handle_guess(room, player_key, data)
        return
    if t == "ping":
        await _send_one(room, player_key, {"type": "pong"})
        return


async def _handle_message_safe(room: MatchRoom, player_key: PlayerKey, data: dict[str, Any]) -> None:
    try:
        await _handle_message(room, player_key, data)
    except Exception:
        log.exception("match ws handler failed")
        await _send_one(
            room,
            player_key,
            {"type": "error", "message": "Server error — check backend logs."},
        )


async def run_match_socket(websocket: WebSocket, raw_code: str, token: str) -> None:
    code = _normalize_code(raw_code)
    room = rooms.get(code)
    if not room:
        await websocket.close(code=4404)
        return
    player_key = room.player_key_for_token(token)
    if not player_key:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    async with room.lock:
        if player_key == "host":
            if room.host_ws is not None:
                try:
                    await websocket.close(code=4409)
                except Exception:
                    pass
                return
            room.host_ws_set(websocket)
        else:
            g = room.guests.get(player_key)
            if g is None or g.ws is not None:
                try:
                    await websocket.close(code=4409)
                except Exception:
                    pass
                return
            room.guest_ws_set(player_key, websocket)
    await _lobby_snapshot(room)

    try:
        while True:
            raw = await websocket.receive_json()
            if not isinstance(raw, dict):
                continue
            async with room.lock:
                r2 = rooms.get(code)
                if r2 is not room:
                    break
                await _handle_message_safe(room, player_key, raw)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("match ws receive loop failed")
    finally:
        async with room.lock:
            if rooms.get(code) is not room:
                return
            if player_key == "host":
                if room.host_ws is websocket:
                    room.host_ws_set(None)
                if room.phase == "lobby":
                    rooms.pop(code, None)
                elif room.phase == "playing":
                    await _finish_match(room, from_disconnect=True)
                return
            if player_key in room.guests:
                if room.guests[player_key].ws is websocket:
                    room.guest_ws_set(player_key, None)
                if room.phase == "lobby":
                    del room.guests[player_key]
                    await _lobby_snapshot(room)
                elif room.phase == "playing":
                    await _finish_match(room, from_disconnect=True)
