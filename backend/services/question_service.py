"""Mirrors game pool logic from app.py (Flask)."""

from __future__ import annotations

import html
import logging
import random
import re
import sqlite3
from pathlib import Path
from typing import Any

from config import settings

_ak_log = logging.getLogger("animals_kingdom")


def _normalize_remote_image_url(url: str) -> str:
    u = url.strip()
    if not u:
        return ""
    if u.startswith("//"):
        return f"https:{u}"
    return u


def resolve_question_image_url(
    png_file_name: str,
    image_url_1280: str,
    *,
    embed_mode: bool = False,
) -> str:
    """
    Normal: prefer on-disk PNG when `images/` exists; otherwise Wikimedia URL from the DB.

    Embed mode: never use `images/` or `/api/images/` — only a normalized https URL from the DB
    (so the client can show Wikimedia-style `<a><img></a>` without local files).
    """
    name = (png_file_name or "").strip()
    remote = _normalize_remote_image_url(image_url_1280)
    if embed_mode:
        return remote
    images_dir = settings.images_dir
    if images_dir.is_dir() and name:
        local = images_dir / name
        if local.is_file():
            return f"/api/images/{name}"
    if remote:
        return remote
    if name:
        return f"/api/images/{name}"
    return remote


_THUMB_PX = re.compile(r"/(\d{3,4})px-")


def commons_embed_thumb_url(image_url: str, target_px: int = 960) -> str:
    """Prefer a 960px-style Commons thumb URL when the DB has another fixed width (e.g. 1280px)."""
    u = (image_url or "").strip()
    if not u:
        return u
    m = _THUMB_PX.search(u)
    if m and m.group(1) != str(target_px):
        return u[: m.start()] + f"/{target_px}px-" + u[m.end() :]
    return u


def build_wikimedia_embed_html(
    *,
    animal_name: str,
    image_src: str,
    source_page: str,
) -> str:
    """
    Same structure as typical Commons embed: linked attribution + <img> with remote src.
    `source_page` should be the Commons file page URL when available.
    """
    src = commons_embed_thumb_url(image_src, 960)
    alt = html.escape(animal_name or "Animal", quote=True)
    title = html.escape(
        "Wikimedia Commons - open the file page for author, license, and attribution.",
        quote=True,
    )
    href = (source_page or "").strip()
    if not href.startswith(("http://", "https://")):
        href = src
    return (
        f'<a title="{title}" href="{html.escape(href, quote=True)}">'
        f'<img width="960" alt="{alt}" src="{html.escape(src, quote=True)}" '
        'style="max-width:100%;height:auto;max-height:280px;object-fit:contain;border-radius:12px;display:block;margin:0 auto;" />'
        f"</a>"
    )


def split_pipe(value: Any) -> list[str]:
    if value is None:
        return []
    value = str(value).strip()
    if not value or value.lower() in {"nan", "none", "null", "undefined"}:
        return []
    return [x.strip() for x in value.split("|") if x.strip()]


def _parse_difficulty(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "animal_name": row["animal_name"] or "",
        "scientific_name": row["scientific_name"] or "",
        "animal_family": row["animal_family"] or "",
        "hierarchy": row["hierarchy"] or "",
        "source_page": row["source_page"] or "",
        "image_url_1280": row["image_url_1280"] or "",
        "png_file_name": row["png_file_name"] or "",
        "comments": split_pipe(row["comments"]),
        "wrong_answers": split_pipe(row["wrong_answers"]),
        "difficulty": _parse_difficulty(row["difficulty"]),
        "fun_fact": row["fun_fact"] or "",
    }


def fetch_animal_by_id(db_path: Path, animal_id: int) -> dict[str, Any] | None:
    """Single row from `animals` by primary key, or None if missing."""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            id,
            animal_name,
            scientific_name,
            animal_family,
            hierarchy,
            source_page,
            image_url_1280,
            png_file_name,
            comments,
            wrong_answers,
            difficulty,
            fun_fact
        FROM animals
        WHERE id = ?
        """,
        (animal_id,),
    )
    row = cur.fetchone()
    conn.close()
    if row is None:
        return None
    return row_to_dict(row)


def fetch_all_animals(db_path: Path) -> list[dict[str, Any]]:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            id,
            animal_name,
            scientific_name,
            animal_family,
            hierarchy,
            source_page,
            image_url_1280,
            png_file_name,
            comments,
            wrong_answers,
            difficulty,
            fun_fact
        FROM animals
        ORDER BY id
        """
    )
    rows = cur.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def difficulty_range_for_level(level: int) -> tuple[int, int]:
    if level == 1:
        return (1, 3)
    if level == 2:
        return (3, 6)
    if level == 3:
        return (6, 10)
    raise ValueError("Invalid level")


def _normalize_animal_name_key(name: Any) -> str:
    return str(name or "").strip().lower()


def dedupe_pool_by_animal_name(pool: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One row per distinct animal name so the same name never appears twice in one sample."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for a in pool:
        key = _normalize_animal_name_key(a.get("animal_name"))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def game_pool_for_level(db_path: Path, level: int) -> list[dict[str, Any]]:
    low, high = difficulty_range_for_level(level)
    animals = fetch_all_animals(db_path)
    pool: list[dict[str, Any]] = []
    for a in animals:
        difficulty = a["difficulty"]
        if not isinstance(difficulty, int):
            continue
        if not (low <= difficulty <= high):
            continue
        if len(a["wrong_answers"]) < 3:
            continue
        if "perfect" not in a["comments"]:
            continue
        if "bad pic" in a["comments"]:
            continue
        if not a["png_file_name"] and not a["image_url_1280"]:
            continue
        pool.append(a)
    return pool


# Path-segment match on hierarchy (see GET /api/game/start). Avoids false positives like "fish" in "starfish".
ALLOWED_HIERARCHY_MODES: frozenset[str] = frozenset(
    {"birds", "amphibians", "arthropods", "fish", "mammals", "carnivora", "reptiles"}
)


def _hierarchy_matches_mode(hierarchy: str, mode: str) -> bool:
    """
    True if `mode` appears as a /-separated segment in the taxonomy path
    (e.g. Animals/Birds/... → birds), not merely as a substring inside a segment.
    """
    h = str(hierarchy or "").strip().lower()
    m = mode.strip().lower()
    if not h or not m:
        return False
    if f"/{m}/" in h:
        return True
    if h.endswith(f"/{m}"):
        return True
    if h.startswith(f"{m}/"):
        return True
    if h == m:
        return True
    return False


def _validate_hierarchy_questions(
    questions: list[dict[str, Any]],
    pool: list[dict[str, Any]],
    hm: str,
) -> None:
    """Hard guarantee: every row matches the segment filter; every option is a name from the filtered pool."""
    pool_name_keys = {_normalize_animal_name_key(a.get("animal_name")) for a in pool}
    for q in questions:
        hier = str(q.get("hierarchy") or "")
        if not _hierarchy_matches_mode(hier, hm):
            raise ValueError(
                f"Internal hierarchy check failed for id={q.get('id')}: {hier!r} does not match mode {hm!r}"
            )
        opts = list(q.get("options") or [])
        for opt in opts:
            if _normalize_animal_name_key(opt) not in pool_name_keys:
                raise ValueError(
                    f"Internal hierarchy check failed for id={q.get('id')}: option {opt!r} "
                    f"is not an animal_name in the filtered pool (mode={hm!r})"
                )


def _pick_three_wrong_answers(
    animal: dict[str, Any],
    pool: list[dict[str, Any]],
    *,
    hierarchy_mode_active: bool,
) -> list[str]:
    """
    Normal mode: 3 distractors from this row's `wrong_answers` (legacy).

    Hierarchy / group mode: prefer other **animal names from the same filtered pool** so every
    option is an animal that passed the hierarchy filter (DB `wrong_answers` often lists unrelated
    taxa).
    """
    if not hierarchy_mode_active:
        wa = list(animal.get("wrong_answers") or [])
        if len(wa) < 3:
            raise ValueError(f"Animal {animal.get('animal_name')!r} has fewer than 3 wrong_answers.")
        return random.sample(wa, 3)

    correct = str(animal.get("animal_name") or "").strip()
    ckey = _normalize_animal_name_key(correct)
    picked: list[str] = []
    seen: set[str] = {ckey}

    others: list[str] = []
    for a in pool:
        n = str(a.get("animal_name") or "").strip()
        k = _normalize_animal_name_key(n)
        if not k or k == ckey:
            continue
        others.append(n)
    random.shuffle(others)
    for n in others:
        if len(picked) >= 3:
            break
        k = _normalize_animal_name_key(n)
        if k not in seen:
            picked.append(n)
            seen.add(k)

    from_pool = len(picked)
    # Do not fall back to DB wrong_answers here: those strings are often other taxa (e.g. lizards in "bird" rounds).

    _ak_log.info(
        "distractors for correct=%r | from_same_filtered_pool=%d/3 total_built=%d pool_size=%d",
        correct,
        min(from_pool, 3),
        len(picked),
        len(pool),
    )

    if len(picked) < 3:
        raise ValueError(
            f"Cannot build 3 unique distractors for {correct!r} in this group (pool size {len(pool)})."
        )
    return picked[:3]


def build_game_questions(
    db_path: Path,
    level: int,
    count: int = 10,
    exclude_animal_names: frozenset[str] | None = None,
    *,
    hierarchy_mode: str | None = None,
    embed_mode: bool = False,
) -> list[dict[str, Any]]:
    hm_active = bool(hierarchy_mode and str(hierarchy_mode).strip())
    pool = dedupe_pool_by_animal_name(game_pool_for_level(db_path, level))
    if embed_mode:
        before_em = len(pool)
        pool = [a for a in pool if _normalize_remote_image_url(str(a.get("image_url_1280") or ""))]
        _ak_log.info(
            "build_game_questions | embed_mode remote-only pool | %d rows (was %d)",
            len(pool),
            before_em,
        )
    _ak_log.info(
        "build_game_questions | level=%d hierarchy_mode=%r | pool_after_level_rules=%d",
        level,
        hierarchy_mode,
        len(pool),
    )
    if hierarchy_mode:
        hm = hierarchy_mode.strip().lower()
        if hm not in ALLOWED_HIERARCHY_MODES:
            raise ValueError(f"Unknown hierarchy_mode {hierarchy_mode!r}.")
        before_h = len(pool)
        pool = [a for a in pool if _hierarchy_matches_mode(str(a.get("hierarchy") or ""), hm)]
        _ak_log.info(
            "build_game_questions | hierarchy segment %r | kept %d / %d | sample_hierarchy=%s",
            hm,
            len(pool),
            before_h,
            [str(a.get("hierarchy") or "")[:88] for a in pool[:4]],
        )
    if exclude_animal_names:
        ex = {n.strip().lower() for n in exclude_animal_names if str(n).strip()}
        before_ex = len(pool)
        pool = [a for a in pool if _normalize_animal_name_key(a.get("animal_name")) not in ex]
        _ak_log.info(
            "build_game_questions | after exclude_animal_names | %d (was %d)",
            len(pool),
            before_ex,
        )
    if len(pool) < count:
        if hierarchy_mode:
            raise ValueError(
                f"Not enough animals for hierarchy group {hierarchy_mode!r} at this difficulty "
                f"(level {level}). Need {count}, found {len(pool)}."
            )
        raise ValueError(f"Not enough animals for level {level}. Need {count}, found {len(pool)}.")

    chosen = random.sample(pool, count)
    questions: list[dict[str, Any]] = []
    for animal in chosen:
        wrongs = _pick_three_wrong_answers(animal, pool, hierarchy_mode_active=hm_active)
        options = wrongs + [animal["animal_name"]]
        if hm_active:
            options = sorted(options, key=_normalize_animal_name_key)
        else:
            random.shuffle(options)
        questions.append(
            {
                "id": animal["id"],
                "animal_name": animal["animal_name"],
                "scientific_name": animal["scientific_name"],
                "animal_family": animal["animal_family"],
                "hierarchy": animal["hierarchy"],
                "png_file_name": animal["png_file_name"],
                "image_url_1280": animal["image_url_1280"],
                "source_page": animal.get("source_page") or "",
                "fun_fact": animal["fun_fact"],
                "difficulty": animal["difficulty"],
                "correct_answer": animal["animal_name"],
                "options": options,
            }
        )
    if hm_active:
        _validate_hierarchy_questions(questions, pool, hierarchy_mode.strip().lower())
    return questions


def parse_level(difficulty: str | None, level: int | None) -> int:
    if level is not None:
        if level not in (1, 2, 3):
            raise ValueError("level must be 1, 2, or 3")
        return level
    if difficulty is None:
        raise ValueError("Provide either difficulty (easy|medium|hard) or level (1|2|3)")
    key = difficulty.strip().lower()
    mapping = {"easy": 1, "medium": 2, "hard": 3}
    if key not in mapping:
        raise ValueError("difficulty must be easy, medium, or hard")
    return mapping[key]


def build_formatted_game_questions(
    db_path: Path,
    *,
    difficulty: str | None = None,
    level: int | None = None,
    count: int = 10,
    exclude_animal_names: frozenset[str] | None = None,
    hierarchy_mode: str | None = None,
    embed_mode: bool = False,
) -> tuple[int, str, list[dict[str, Any]]]:
    """Same card content as `GET /api/game/start` — used by HTTP handler and 1v1 matchmaking."""
    lv = parse_level(difficulty, level)
    raw = build_game_questions(
        db_path,
        lv,
        count=count,
        exclude_animal_names=exclude_animal_names,
        hierarchy_mode=hierarchy_mode,
        embed_mode=embed_mode,
    )
    labels = {1: "easy", 2: "medium", 3: "hard"}
    questions: list[dict[str, Any]] = []
    for q in raw:
        img = resolve_question_image_url(
            str(q["png_file_name"] or ""),
            str(q.get("image_url_1280") or ""),
            embed_mode=embed_mode,
        )
        embed_html: str | None = None
        if embed_mode and img and (img.startswith("http://") or img.startswith("https://")):
            embed_html = build_wikimedia_embed_html(
                animal_name=str(q.get("correct_answer") or q.get("animal_name") or ""),
                image_src=img,
                source_page=str(q.get("source_page") or ""),
            )
        questions.append(
            {
                "id": int(q["id"]),
                "animal_name": q["animal_name"],
                "scientific_name": q["scientific_name"],
                "animal_family": q["animal_family"],
                "hierarchy": q["hierarchy"],
                "png_file_name": q["png_file_name"],
                "fun_fact": q["fun_fact"] or "",
                "difficulty": int(q["difficulty"]),
                "correct_answer": q["correct_answer"],
                "options": q["options"],
                "image_url": img,
                "image_embed_html": embed_html if embed_mode else None,
            }
        )
    return lv, labels[lv], questions
