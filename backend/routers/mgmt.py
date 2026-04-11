"""Dev management API — only for local tooling; gated by X-Animals-Kingdom-Dev-User header."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from config import settings
from services.mgmt_log_buffer import append_synthetic, fetch_logs_after
from services.question_service import ALLOWED_HIERARCHY_MODES, build_formatted_game_questions

router = APIRouter(prefix="/api/mgmt", tags=["mgmt"])

ALLOWED_MGMT_USER_NORM = "roi_boi"

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def require_mgmt_dev_user(
    x_dev_user: Annotated[str | None, Header(alias="X-Animals-Kingdom-Dev-User")] = None,
) -> str:
    norm = (x_dev_user or "").strip().lower()
    if norm != ALLOWED_MGMT_USER_NORM:
        raise HTTPException(status_code=403, detail="Dev management is only available to the roi_boi account.")
    return norm


class LogsResponse(BaseModel):
    lines: list[dict[str, Any]]
    max_seq: int


class StatusResponse(BaseModel):
    ok: bool = True
    db_exists: bool
    db_path: str
    images_dir: str
    images_dir_exists: bool
    python_exe: str
    repo_root: str
    backend_dir: str
    mobile_dir: str
    npx_path: str | None


class VerifyHierarchyBody(BaseModel):
    mode: str = Field(..., description="One of the hierarchy_mode tokens, e.g. birds")


class VerifyHierarchyResult(BaseModel):
    ok: bool
    mode: str
    checks: list[dict[str, Any]]
    error: str | None = None


class RunCmdBody(BaseModel):
    """Optional experimental runner (Windows). Use with care."""

    kind: str = Field(..., description="expo_web | uvicorn_secondary")


@router.get("/logs", response_model=LogsResponse)
def mgmt_logs(
    after: int = 0,
    limit: int = 500,
    _: str = Depends(require_mgmt_dev_user),
) -> LogsResponse:
    lines, max_seq = fetch_logs_after(after, min(limit, 800))
    return LogsResponse(lines=lines, max_seq=max_seq)


@router.get("/status", response_model=StatusResponse)
def mgmt_status(_: str = Depends(require_mgmt_dev_user)) -> StatusResponse:
    db_path = settings.db_path
    img = settings.images_dir
    return StatusResponse(
        db_exists=db_path.is_file(),
        db_path=str(db_path),
        images_dir=str(img),
        images_dir_exists=img.is_dir(),
        python_exe=sys.executable,
        repo_root=str(_REPO_ROOT),
        backend_dir=str(_REPO_ROOT / "backend"),
        mobile_dir=str(_REPO_ROOT / "mobile"),
        npx_path=shutil.which("npx") or shutil.which("npx.cmd"),
    )


@router.get("/commands")
def mgmt_command_hints(_: str = Depends(require_mgmt_dev_user)) -> dict[str, Any]:
    root = str(_REPO_ROOT)
    back = str(_REPO_ROOT / "backend")
    mob = str(_REPO_ROOT / "mobile")
    venv_activate = str(_REPO_ROOT / ".venv" / "Scripts" / "Activate.ps1")
    return {
        "title": "Run these in separate PowerShell windows",
        "steps": [
            {
                "name": "1. Backend (API)",
                "cwd": back,
                "command": (
                    f'cd "{back}"\n'
                    f'& "{venv_activate}"\n'
                    "py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
                ),
            },
            {
                "name": "2. Mobile (Expo web)",
                "cwd": mob,
                "command": f'cd "{mob}"\nnpx expo start --web --port 8086',
            },
            {
                "name": "Firewall (Admin PowerShell)",
                "cwd": None,
                "command": "netsh advfirewall firewall add rule name=\"Animals API 8000\" dir=in action=allow protocol=TCP localport=8000",
            },
        ],
        "env_mobile": "mobile/.env → EXPO_PUBLIC_API_FOLLOW_METRO=1",
    }


@router.post("/verify-hierarchy", response_model=VerifyHierarchyResult)
def mgmt_verify_hierarchy(
    body: VerifyHierarchyBody,
    _: str = Depends(require_mgmt_dev_user),
) -> VerifyHierarchyResult:
    mode = body.mode.strip().lower()
    if mode not in ALLOWED_HIERARCHY_MODES:
        raise HTTPException(400, detail=f"Invalid mode. Use one of: {sorted(ALLOWED_HIERARCHY_MODES)}")

    db_path = settings.db_path
    if not db_path.is_file():
        return VerifyHierarchyResult(ok=False, mode=mode, checks=[], error="Database file missing.")

    checks: list[dict[str, Any]] = []
    try:
        for difficulty in ("easy", "medium", "hard"):
            _lv, _label, qdicts = build_formatted_game_questions(
                db_path,
                difficulty=difficulty,
                count=10,
                hierarchy_mode=mode,
            )
            sample = qdicts[0] if qdicts else {}
            checks.append(
                {
                    "difficulty": difficulty,
                    "question_count": len(qdicts),
                    "sample_hierarchy": (sample.get("hierarchy") or "")[:120],
                    "sample_options": sample.get("options"),
                }
            )
        append_synthetic("INFO", f"verify-hierarchy OK for mode={mode!r} (easy/medium/hard × 10)")
        return VerifyHierarchyResult(ok=True, mode=mode, checks=checks, error=None)
    except Exception as exc:
        append_synthetic("ERROR", f"verify-hierarchy exception: {exc}")
        return VerifyHierarchyResult(ok=False, mode=mode, checks=checks, error=str(exc))


@router.post("/spawn")
async def mgmt_spawn(
    body: RunCmdBody,
    _: str = Depends(require_mgmt_dev_user),
) -> dict[str, Any]:
    """
    Best-effort background process on the dev machine. Does not track output in the ring buffer yet.
    """
    if sys.platform != "win32":
        raise HTTPException(400, detail="Spawn is only wired for Windows in this build.")

    append_synthetic("WARNING", f"spawn requested: {body.kind}")

    if body.kind == "expo_web":
        npx = shutil.which("npx.cmd") or shutil.which("npx")
        if not npx:
            raise HTTPException(503, detail="npx not found on PATH.")
        mob = _REPO_ROOT / "mobile"
        proc = subprocess.Popen(
            [npx, "expo", "start", "--web", "--port", "8086"],
            cwd=str(mob),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,  # type: ignore[attr-defined]
        )
        return {"ok": True, "pid": proc.pid, "note": "Expo started detached; check a new window or Task Manager."}

    if body.kind == "uvicorn_secondary":
        back = _REPO_ROOT / "backend"
        py = sys.executable
        proc = subprocess.Popen(
            [py, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"],
            cwd=str(back),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,  # type: ignore[attr-defined]
        )
        return {"ok": True, "pid": proc.pid, "note": "Second API on :8001 — point .env here only if you mean to."}

    raise HTTPException(400, detail="Unknown kind")


@router.post("/ping")
def mgmt_ping(_: str = Depends(require_mgmt_dev_user)) -> dict[str, str]:
    append_synthetic("INFO", "mgmt ping from dev panel")
    return {"status": "ok"}
