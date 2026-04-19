from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import settings
from routers.mgmt import router as mgmt_router
from services import match_service as match_service_mod
from services.mgmt_log_buffer import install_mgmt_ring_handler
from services.match_service import (
    MATCH_PROTOCOL_VERSION,
    create_room,
    join_room,
    list_open_rooms,
    lookup_room,
    run_match_socket,
)
from services.question_service import (
    ALLOWED_HIERARCHY_MODES,
    build_formatted_game_questions,
    build_wikimedia_embed_html,
    fetch_all_animals,
    resolve_question_image_url,
)

_uvicorn_log = logging.getLogger("uvicorn.error")
_ak_log = logging.getLogger("animals_kingdom")


def _configure_animals_kingdom_logging() -> None:
    """Ensures [animals_kingdom] lines appear in the same terminal as uvicorn (copy-paste debugging)."""
    if _ak_log.handlers:
        return
    _ak_log.setLevel(logging.INFO)
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("[animals_kingdom] %(levelname)s %(message)s"))
    _ak_log.addHandler(h)
    _ak_log.propagate = False


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    _configure_animals_kingdom_logging()
    install_mgmt_ring_handler()
    ms_path = Path(match_service_mod.__file__).resolve()
    _uvicorn_log.warning(
        "Online match: loaded match_service from %s (protocol v%s, no difficulty on start)",
        ms_path,
        MATCH_PROTOCOL_VERSION,
    )
    _ak_log.info("FastAPI startup: game + hierarchy debug logs use logger animals_kingdom (this handler).")
    yield


app = FastAPI(title="Who's That Animal — Game API", version="0.1.0", lifespan=_lifespan)

_MAIN_FILE = Path(__file__).resolve()


@app.get("/AK-MGMT-PROBE", include_in_schema=False)
def ak_mgmt_probe() -> dict[str, Any]:
    """
    Open this in a browser (no /api prefix). If you get 404, port 8000 is not this file's app —
    another process, old code, or wrong host/port.
    """
    return {
        "ok": True,
        "app": "whos_that_animal_game_api",
        "main_py": str(_MAIN_FILE),
    }


app.include_router(mgmt_router)


@app.get("/api/mgmt/public-info")
def mgmt_public_info_on_app() -> dict[str, Any]:
    """Defined on `app` (not only APIRouter) so a single obvious route exists after `include_router`."""
    return {
        "mgmt": "ok",
        "main_py": str(_MAIN_FILE),
        "auth_header": "X-Animals-Kingdom-Dev-User",
        "auth_account_norm": "roi_boi",
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # Browsers disallow allow_origins=["*"] together with allow_credentials=True; keep this public API simple.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionOut(BaseModel):
    id: int
    animal_name: str
    scientific_name: str
    animal_family: str
    hierarchy: str
    png_file_name: str
    fun_fact: str
    difficulty: int
    correct_answer: str
    options: list[str]
    image_url: str = Field(
        description="Client loads this URL as-is: absolute https (Wikimedia) or relative /api/images/… when a local PNG exists.",
    )
    image_embed_html: str | None = Field(
        default=None,
        description="When embed_mode=1: Wikimedia-style <a><img></a> HTML (web clients); image_url is still the https src.",
    )


def _rarity_for_difficulty(d: int) -> str:
    if d <= 2:
        return "common"
    if d <= 4:
        return "uncommon"
    if d <= 6:
        return "rare"
    if d <= 8:
        return "epic"
    if d == 9:
        return "mythic"
    return "legendary"


class CasePoolAnimalOut(BaseModel):
    id: int
    animal_name: str
    difficulty: int
    image_url: str
    rarity: str
    image_embed_html: str | None = Field(
        default=None,
        description="Present when embed_mode=1 on /api/case/pool — same Commons embed pattern as game questions.",
    )


class CasePoolResponse(BaseModel):
    animals: list[CasePoolAnimalOut]


class GameStartResponse(BaseModel):
    ok: bool = True
    level: int
    difficulty_label: str
    question_count: int
    questions: list[QuestionOut]
    hierarchy_mode: str | None = Field(
        default=None,
        description="When set, only animals whose hierarchy contains this token (e.g. birds, mammals).",
    )
    embed_mode: bool = Field(default=False, description="Echo of request: Wikimedia-only images + optional embed HTML.")


class MatchCreateBody(BaseModel):
    entry_cost: int = Field(default=50, ge=1, le=100_000)
    password: str | None = Field(default=None, max_length=64)


class MatchCreateResponse(BaseModel):
    ok: bool = True
    code: str
    token: str
    role: str = "host"
    entry_cost: int = 50


class MatchJoinBody(BaseModel):
    code: str
    password: str | None = None


class MatchJoinResponse(BaseModel):
    ok: bool = True
    code: str
    token: str
    role: str = "guest"
    entry_cost: int = 50


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "online_match_protocol": MATCH_PROTOCOL_VERSION,
        "online_match_start": "no_difficulty_progressive_pools",
        "mgmt_dev_api": True,
        "mgmt_public_probe": "/api/mgmt/public-info",
    }


@app.get("/api/match/server_info")
def match_server_info() -> dict[str, Any]:
    """Open this URL on your phone browser to prove which Python file is serving port 8000."""
    return {
        "online_match_protocol": MATCH_PROTOCOL_VERSION,
        "start_game_requires_difficulty": False,
        "match_service_file": str(Path(match_service_mod.__file__).resolve()),
    }


@app.post("/api/match/create", response_model=MatchCreateResponse)
def api_match_create(body: MatchCreateBody | None = None) -> MatchCreateResponse:
    b = body if body is not None else MatchCreateBody()
    code, token, entry_cost = create_room(entry_cost=b.entry_cost, password=b.password)
    return MatchCreateResponse(code=code, token=token, entry_cost=entry_cost)


@app.get("/api/match/open")
def api_match_open() -> dict[str, Any]:
    return {"ok": True, "open": list_open_rooms()}


@app.get("/api/match/lookup")
def api_match_lookup(code: str = Query(..., min_length=3)) -> dict[str, Any]:
    info = lookup_room(code)
    if not info:
        raise HTTPException(status_code=404, detail="No open match found for that code.") from None
    return {"ok": True, **info}


@app.post("/api/match/join", response_model=MatchJoinResponse)
def api_match_join(body: MatchJoinBody) -> MatchJoinResponse:
    try:
        room, token = join_room(body.code, body.password)
    except KeyError:
        raise HTTPException(status_code=404, detail="No match found for that code.") from None
    except RuntimeError as exc:
        if str(exc) == "ROOM_FULL":
            raise HTTPException(status_code=409, detail="That match already has a guest.") from exc
        if str(exc) == "BAD_PASSWORD":
            raise HTTPException(status_code=403, detail="Wrong password for this match.") from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MatchJoinResponse(code=room.code, token=token, entry_cost=room.entry_cost)


@app.websocket("/api/match/ws/{code}")
async def api_match_ws(websocket: WebSocket, code: str, token: str = Query(...)) -> None:
    await run_match_socket(websocket, code, token)


@app.get("/api/case/pool", response_model=CasePoolResponse)
def api_case_pool(
    embed_mode: bool = Query(
        default=False,
        description="If true, never use on-disk images; add image_embed_html (Commons embed) per row.",
    ),
) -> CasePoolResponse:
    db_path: Path = settings.db_path
    if not db_path.is_file():
        raise HTTPException(
            status_code=503,
            detail=f"Database not found at {db_path}.",
        )
    raw = fetch_all_animals(db_path)
    out: list[CasePoolAnimalOut] = []
    for a in raw:
        d = a.get("difficulty")
        if not isinstance(d, int) or d < 1 or d > 10:
            continue
        if not (a.get("png_file_name") or "").strip() and not (a.get("image_url_1280") or "").strip():
            continue
        img = resolve_question_image_url(
            str(a.get("png_file_name") or ""),
            str(a.get("image_url_1280") or ""),
            embed_mode=embed_mode,
        )
        if not img:
            continue
        name = str(a.get("animal_name") or "").strip() or f"Animal #{a['id']}"
        embed_html: str | None = None
        if embed_mode and (img.startswith("http://") or img.startswith("https://")):
            embed_html = build_wikimedia_embed_html(
                animal_name=name,
                image_src=img,
                source_page=str(a.get("source_page") or ""),
            )
        out.append(
            CasePoolAnimalOut(
                id=int(a["id"]),
                animal_name=name,
                difficulty=d,
                image_url=img,
                rarity=_rarity_for_difficulty(d),
                image_embed_html=embed_html,
            )
        )
    if not out:
        raise HTTPException(status_code=503, detail="No animals available for case pool.")
    return CasePoolResponse(animals=out)


@app.get("/api/game/start", response_model=GameStartResponse)
def api_game_start(
    difficulty: str | None = Query(
        default=None,
        description="easy, medium, or hard",
    ),
    level: int | None = Query(
        default=None,
        description="1, 2, or 3 (overrides difficulty if set)",
    ),
    exclude_animal_names: list[str] | None = Query(
        default=None,
        description="Repeat param: correct (animal) names already shown this session — excluded from the draw.",
    ),
    hierarchy_mode: str | None = Query(
        default=None,
        description=(
            "Optional filter: animal's hierarchy must contain this word (case-insensitive). "
            f"Allowed: {', '.join(sorted(ALLOWED_HIERARCHY_MODES))}."
        ),
    ),
    embed_mode: bool = Query(
        default=False,
        description="If true, skip local images/ folder; use Wikimedia URLs and optional image_embed_html per question.",
    ),
) -> GameStartResponse:
    db_path: Path = settings.db_path
    if not db_path.is_file():
        raise HTTPException(
            status_code=503,
            detail=f"Database not found at {db_path}. Place animals.db in the project root (same folder as app.py).",
        )

    ex_names = frozenset(
        x.strip().lower() for x in (exclude_animal_names or []) if x.strip()
    )
    hm = (hierarchy_mode or "").strip().lower() or None
    if hm and hm not in ALLOWED_HIERARCHY_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid hierarchy_mode. Use one of: {', '.join(sorted(ALLOWED_HIERARCHY_MODES))}.",
        )
    _ak_log.info(
        "GET /api/game/start | difficulty=%r level=%r hierarchy_mode=%r embed_mode=%r exclude_animal_names(count)=%d | db=%s",
        difficulty,
        level,
        hm,
        embed_mode,
        len(ex_names),
        db_path,
    )
    try:
        lv2, label_str, qdicts = build_formatted_game_questions(
            db_path,
            difficulty=difficulty,
            level=level,
            count=10,
            exclude_animal_names=ex_names or None,
            hierarchy_mode=hm,
            embed_mode=embed_mode,
        )
    except ValueError as exc:
        _ak_log.warning("GET /api/game/start rejected: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    questions = [QuestionOut(**d) for d in qdicts]
    for i, d in enumerate(qdicts[:3]):
        _ak_log.info(
            "  built Q[%d] id=%s correct_answer=%r hierarchy=%r | options=%s",
            i,
            d.get("id"),
            d.get("correct_answer"),
            (d.get("hierarchy") or "")[:100],
            d.get("options"),
        )
    _ak_log.info(
        "GET /api/game/start OK | level=%s label=%r questions=%d hierarchy_mode=%r",
        lv2,
        label_str,
        len(qdicts),
        hm,
    )

    return GameStartResponse(
        level=lv2,
        difficulty_label=label_str,
        question_count=len(questions),
        questions=questions,
        hierarchy_mode=hm,
        embed_mode=embed_mode,
    )


images_dir = settings.images_dir
if images_dir.is_dir():
    app.mount("/api/images", StaticFiles(directory=str(images_dir)), name="images")
else:

    @app.get("/api/images/{filename:path}")
    def images_missing(filename: str):
        raise HTTPException(
            status_code=503,
            detail=f"Images directory not found: {images_dir}",
        )
