"""In-memory 1v1 speed duels: sync image reveal, first correct scores; first to POINTS_TO_WIN wins."""

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

Role = Literal["host", "guest"]
Phase = Literal["lobby", "playing", "done"]
RoundPhase = Literal["loading", "revealed"]

CODE_ALPHABET = string.ascii_uppercase + string.digits

POINTS_TO_WIN = 10
# Bumped when online match contract changes; exposed on GET /health.
MATCH_PROTOCOL_VERSION = 3

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


@dataclass
class MatchRoom:
    code: str
    host_token: str
    guest_token: str | None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    created_at: float = field(default_factory=time.time)
    phase: Phase = "lobby"

    endless_level: int = 1
    seen_names: list[str] = field(default_factory=list)
    batch: list[dict[str, Any]] = field(default_factory=list)
    batch_i: int = 0

    host_points: int = 0
    guest_points: int = 0

    round_phase: RoundPhase = "loading"
    round_seq: int = 0
    current: dict[str, Any] | None = None
    round_resolved: bool = False
    host_wrong: bool = False
    guest_wrong: bool = False
    host_img_ready: bool = False
    guest_img_ready: bool = False

    host_ws: WebSocket | None = None
    guest_ws: WebSocket | None = None

    entry_cost: int = 50
    password: str | None = None

    def role_for_token(self, token: str) -> Role | None:
        if token == self.host_token:
            return "host"
        if self.guest_token and token == self.guest_token:
            return "guest"
        return None

    def ws_for(self, role: Role) -> WebSocket | None:
        return self.host_ws if role == "host" else self.guest_ws

    def set_ws(self, role: Role, ws: WebSocket | None) -> None:
        if role == "host":
            self.host_ws = ws
        else:
            self.guest_ws = ws


def _normalize_code(code: str) -> str:
    return (code or "").strip().upper()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def create_room(entry_cost: int = 50, password: str | None = None) -> tuple[str, str, int]:
    cost = max(1, min(100_000, int(entry_cost)))
    pw = (password or "").strip() or None
    for _ in range(80):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if code not in rooms:
            room = MatchRoom(
                code=code,
                host_token=_new_token(),
                guest_token=None,
                entry_cost=cost,
                password=pw,
            )
            rooms[code] = room
            return code, room.host_token, room.entry_cost
    raise RuntimeError("Could not allocate a room code")


def join_room(raw_code: str, password: str | None = None) -> tuple[MatchRoom, str]:
    code = _normalize_code(raw_code)
    room = rooms.get(code)
    if not room:
        raise KeyError("ROOM_NOT_FOUND")
    if room.guest_token is not None:
        raise RuntimeError("ROOM_FULL")
    if room.password is not None:
        if (password or "").strip() != room.password:
            raise RuntimeError("BAD_PASSWORD")
    token = _new_token()
    room.guest_token = token
    return room, token


def lookup_room(raw_code: str) -> dict[str, Any] | None:
    """Public info for joining by code (no guest slot taken)."""
    code = _normalize_code(raw_code)
    room = rooms.get(code)
    if not room:
        return None
    if room.phase != "lobby" or room.guest_token is not None:
        return None
    return {
        "code": room.code,
        "entry_cost": room.entry_cost,
        "has_password": room.password is not None,
    }


def list_open_rooms() -> list[dict[str, Any]]:
    """Rooms in lobby, no guest yet, host WebSocket still connected (listed in battle list)."""
    out: list[dict[str, Any]] = []
    for code, room in rooms.items():
        if room.phase != "lobby" or room.guest_token is not None or room.host_ws is None:
            continue
        out.append(
            {
                "code": code,
                "entry_cost": room.entry_cost,
                "has_password": room.password is not None,
            }
        )
    out.sort(key=lambda x: x["code"])
    return out


async def _broadcast(room: MatchRoom, payload: dict[str, Any]) -> None:
    for ws in (room.host_ws, room.guest_ws):
        if ws is not None:
            try:
                await ws.send_json(payload)
            except Exception:
                pass


async def _lobby_snapshot(room: MatchRoom) -> None:
    guest_joined = room.guest_token is not None
    both_ws = room.host_ws is not None and room.guest_ws is not None
    await _broadcast(
        room,
        {
            "type": "lobby",
            "code": room.code,
            "guest_joined": guest_joined,
            "both_connected": both_ws,
            "can_start": bool(guest_joined and both_ws and room.phase == "lobby"),
            "entry_cost": room.entry_cost,
        },
    )


async def _send_one(room: MatchRoom, role: Role, payload: dict[str, Any]) -> None:
    ws = room.ws_for(role)
    if ws is not None:
        try:
            await ws.send_json(payload)
        except Exception:
            pass


async def _finish_match(room: MatchRoom) -> None:
    room.phase = "done"
    hp, gp = room.host_points, room.guest_points
    if hp > gp:
        rh, rg = "win", "lose"
    elif gp > hp:
        rh, rg = "lose", "win"
    else:
        rh, rg = "tie", "tie"
    await _broadcast(
        room,
        {
            "type": "match_end",
            "host_points": hp,
            "guest_points": gp,
            "points_to_win": POINTS_TO_WIN,
            "host_result": rh,
            "guest_result": rg,
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
    if room.host_points >= POINTS_TO_WIN or room.guest_points >= POINTS_TO_WIN:
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
    room.host_wrong = False
    room.guest_wrong = False
    room.host_img_ready = False
    room.guest_img_ready = False
    room.round_seq += 1

    diff_label = _pool_difficulty_for_endless_level(room.endless_level)
    await _broadcast(
        room,
        {
            "type": "round_start",
            "round_seq": room.round_seq,
            "endless_level": room.endless_level,
            "pool_label": diff_label,
            "question": q,
            "host_points": room.host_points,
            "guest_points": room.guest_points,
            "points_to_win": POINTS_TO_WIN,
            "image_revealed": False,
        },
    )


async def _after_round_pause(room: MatchRoom) -> None:
    await asyncio.sleep(1.55)
    await _start_next_round(room)


async def _handle_start_game(room: MatchRoom, role: Role, _data: dict[str, Any]) -> None:
    """Host taps start — no difficulty; question pools match solo endless (level 1 → 10)."""
    if role != "host":
        await _send_one(room, role, {"type": "error", "message": "Only the host can start the match."})
        return
    if room.phase != "lobby":
        await _send_one(room, role, {"type": "error", "message": "Match already started or finished."})
        return
    if room.guest_token is None or room.host_ws is None or room.guest_ws is None:
        await _send_one(room, role, {"type": "error", "message": "Wait for your friend to connect."})
        return
    db_path = settings.db_path
    if not db_path.is_file():
        await _send_one(room, role, {"type": "error", "message": "Server database is not available."})
        return

    room.phase = "playing"
    room.endless_level = 1
    room.seen_names = []
    room.batch = []
    room.batch_i = 0
    room.host_points = 0
    room.guest_points = 0
    room.round_seq = 0
    room.current = None

    try:
        await _refill_batch(room)
    except ValueError as exc:
        room.phase = "lobby"
        await _send_one(room, role, {"type": "error", "message": str(exc)})
        return

    await _start_next_round(room)


async def _handle_image_ready(room: MatchRoom, role: Role) -> None:
    if room.phase != "playing" or room.round_phase != "loading" or room.round_resolved:
        return
    if role == "host":
        room.host_img_ready = True
    else:
        room.guest_img_ready = True
    if room.host_img_ready and room.guest_img_ready:
        room.round_phase = "revealed"
        await _broadcast(room, {"type": "image_reveal", "round_seq": room.round_seq})


async def _handle_guess(room: MatchRoom, role: Role, data: dict[str, Any]) -> None:
    if room.phase != "playing" or not room.current:
        return
    if room.round_resolved:
        return
    if room.round_phase != "revealed":
        await _send_one(room, role, {"type": "error", "message": "Wait until the picture is revealed."})
        return
    if role == "host" and room.host_wrong:
        return
    if role == "guest" and room.guest_wrong:
        return

    choice = str(data.get("choice") or "")
    correct = choice == str(room.current.get("correct_answer") or "")

    if correct:
        room.round_resolved = True
        if role == "host":
            room.host_points += 1
        else:
            room.guest_points += 1
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
                "winner": role,
                "correct_answer": room.current.get("correct_answer"),
                "host_points": room.host_points,
                "guest_points": room.guest_points,
                "points_to_win": POINTS_TO_WIN,
            },
        )
        if room.host_points >= POINTS_TO_WIN or room.guest_points >= POINTS_TO_WIN:
            await _finish_match(room)
            return
        await _after_round_pause(room)
        return

    if role == "host":
        room.host_wrong = True
    else:
        room.guest_wrong = True

    await _broadcast(
        room,
        {
            "type": "guess_result",
            "round_seq": room.round_seq,
            "wrong_role": role,
            "host_points": room.host_points,
            "guest_points": room.guest_points,
        },
    )

    if room.host_wrong and room.guest_wrong:
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
                "reason": "both_wrong",
                "winner": None,
                "correct_answer": room.current.get("correct_answer"),
                "host_points": room.host_points,
                "guest_points": room.guest_points,
                "points_to_win": POINTS_TO_WIN,
            },
        )
        await _after_round_pause(room)


async def _handle_message(room: MatchRoom, role: Role, data: dict[str, Any]) -> None:
    t = data.get("type")
    if t == "start_game":
        await _handle_start_game(room, role, data)
        return
    if t == "image_ready":
        await _handle_image_ready(room, role)
        return
    if t == "guess":
        await _handle_guess(room, role, data)
        return
    if t == "ping":
        await _send_one(room, role, {"type": "pong"})
        return


async def _handle_message_safe(room: MatchRoom, role: Role, data: dict[str, Any]) -> None:
    try:
        await _handle_message(room, role, data)
    except Exception:
        log.exception("match ws handler failed")
        await _send_one(
            room,
            role,
            {"type": "error", "message": "Server error — check backend logs."},
        )


async def run_match_socket(websocket: WebSocket, raw_code: str, token: str) -> None:
    code = _normalize_code(raw_code)
    room = rooms.get(code)
    if not room:
        await websocket.close(code=4404)
        return
    role = room.role_for_token(token)
    if not role:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    async with room.lock:
        if room.ws_for(role) is not None:
            try:
                await websocket.close(code=4409)
            except Exception:
                pass
            return
        room.set_ws(role, websocket)
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
                await _handle_message_safe(room, role, raw)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("match ws receive loop failed")
    finally:
        async with room.lock:
            if room.ws_for(role) is websocket:
                room.set_ws(role, None)
            if role == "host" and room.guest_token is None and room.phase == "lobby":
                rooms.pop(code, None)
            elif rooms.get(code) is room:
                await _lobby_snapshot(room)
