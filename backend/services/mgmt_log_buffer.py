"""In-memory log ring for the dev management panel (copy-paste friendly)."""

from __future__ import annotations

import logging
import threading
from collections import deque
from typing import Any

_MAX_LINES = 2500
_lines: deque[tuple[int, str, str]] = deque(maxlen=_MAX_LINES)
_seq = 0
_lock = threading.Lock()


class MgmtRingHandler(logging.Handler):
    """Captures log records into an in-memory deque for GET /api/mgmt/logs."""

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.setFormatter(logging.Formatter("%(asctime)s | %(name)s | %(levelname)s | %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
        except Exception:
            msg = record.getMessage()
        global _seq
        with _lock:
            _seq += 1
            _lines.append((_seq, record.levelname, msg))


def install_mgmt_ring_handler() -> MgmtRingHandler | None:
    """Attach once so uvicorn (root) and `animals_kingdom` (non-propagating) both feed the panel."""
    root = logging.getLogger()
    ak = logging.getLogger("animals_kingdom")

    existing: MgmtRingHandler | None = None
    for h in root.handlers:
        if isinstance(h, MgmtRingHandler):
            existing = h
            break
    if existing is None:
        for h in ak.handlers:
            if isinstance(h, MgmtRingHandler):
                existing = h
                break

    if existing is not None:
        if not any(isinstance(x, MgmtRingHandler) for x in root.handlers):
            root.addHandler(existing)
        if not any(isinstance(x, MgmtRingHandler) for x in ak.handlers):
            ak.addHandler(existing)
        return existing

    h = MgmtRingHandler()
    root.addHandler(h)
    ak.addHandler(h)
    if root.level > logging.INFO:
        root.setLevel(logging.INFO)
    return h


def fetch_logs_after(after_seq: int, limit: int = 400) -> tuple[list[dict[str, Any]], int]:
    """Return lines with seq > after_seq, newest `limit` slice, and current max seq."""
    with _lock:
        max_seq = _seq
        items = [t for t in _lines if t[0] > after_seq]
        if len(items) > limit:
            items = items[-limit:]
        out = [{"seq": s, "level": lvl, "text": txt} for s, lvl, txt in items]
    return out, max_seq


def append_synthetic(level: str, text: str) -> None:
    """Manual line (e.g. action result) into the same buffer."""
    global _seq
    with _lock:
        _seq += 1
        _lines.append((_seq, level, text))
