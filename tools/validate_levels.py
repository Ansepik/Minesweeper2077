#!/usr/bin/env python3
"""Validate CyberSweep's bundled level data without third-party packages."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_HTML = ROOT / "web" / "index.html"
ANDROID_HTML = ROOT / "android-app" / "app" / "src" / "main" / "assets" / "index.html"
WEB_LEVELS = ROOT / "web" / "levels.json"
ANDROID_LEVELS = ROOT / "android-app" / "app" / "src" / "main" / "assets" / "levels.json"


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"cannot parse {path.relative_to(ROOT)}: {exc}")


def validate_level(name, level):
    for key in ("w", "h", "mines", "grid", "safe"):
        if key not in level:
            fail(f"{name}: missing field {key}")
    w, h, mines, grid = level["w"], level["h"], level["mines"], level["grid"]
    if not isinstance(w, int) or not isinstance(h, int) or w < 1 or h < 1:
        fail(f"{name}: invalid dimensions")
    if len(grid) != w * h:
        fail(f"{name}: grid length {len(grid)} != {w*h}")
    if sum(v == -1 for v in grid) != mines:
        fail(f"{name}: declared mine count does not match grid")
    for idx, value in enumerate(grid):
        if not isinstance(value, int) or value < -1 or value > 8:
            fail(f"{name}: invalid cell value at index {idx}: {value}")
        if value == -1:
            continue
        x, y = idx % w, idx // w
        adjacent = 0
        for ny in range(max(0, y - 1), min(h, y + 2)):
            for nx in range(max(0, x - 1), min(w, x + 2)):
                if (nx != x or ny != y) and grid[ny * w + nx] == -1:
                    adjacent += 1
        if value != adjacent:
            fail(f"{name}: wrong adjacent-mine count at index {idx}: {value} != {adjacent}")
    safe = level["safe"]
    if not safe:
        fail(f"{name}: safe starting cells are empty")
    if len(set(safe)) != len(safe):
        fail(f"{name}: duplicate safe starting cells")
    for idx in safe:
        if not isinstance(idx, int) or idx < 0 or idx >= len(grid) or grid[idx] == -1:
            fail(f"{name}: invalid safe starting cell {idx}")


def main():
    web_data = load_json(WEB_LEVELS)
    android_data = load_json(ANDROID_LEVELS)
    if web_data != android_data:
        fail("web/levels.json and Android assets/levels.json differ")

    html = WEB_HTML.read_text(encoding="utf-8")
    android_html = ANDROID_HTML.read_text(encoding="utf-8")
    if html != android_html:
        fail("web/index.html and Android assets/index.html differ")

    match = re.search(r"const __EMBEDDED_BASE=(\{.*?\});\s*/\*\s*АСИНХРОН", html, re.S)
    if not match:
        fail("cannot locate __EMBEDDED_BASE in web/index.html")
    try:
        embedded = json.loads(match.group(1))
    except Exception as exc:
        fail(f"embedded level database is invalid JSON: {exc}")
    if embedded != web_data:
        fail("embedded level database differs from levels.json")

    levels = web_data.get("levels", {})
    free = web_data.get("free", {})
    if len(levels) != 100:
        fail(f"expected 100 campaign levels, found {len(levels)}")
    if len(free) != 16:
        fail(f"expected 16 free-play presets, found {len(free)}")

    for key, level in levels.items():
        validate_level(f"campaign level {key}", level)
    for key, level in free.items():
        validate_level(f"free preset {key}", level)

    print(f"OK: {len(levels)} campaign levels and {len(free)} free-play presets.")
    print("OK: grid dimensions, mine counts, clue numbers, and safe cells.")
    print("OK: embedded/web/Android level databases are identical.")
    print("NOTE: this script checks structural validity, not logical solvability.")


if __name__ == "__main__":
    main()
