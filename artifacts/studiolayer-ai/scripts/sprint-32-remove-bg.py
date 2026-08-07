#!/usr/bin/env python3
"""Sprint 3.2 — true alpha-channel PNG master assets from studio originals."""

from __future__ import annotations

import shutil
import sys
from collections import deque
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
IDENTITIES_DIR = SCRIPT_DIR.parent / "public" / "identities"
SOURCE_DIR = Path("/Users/neerajtripathi/Desktop/StudioLayerAI/Model Images")

PRODUCTION_FILES = [
    "F-IN-01.png", "F-CA-01.png", "F-AF-01.png", "F-EA-01.png", "F-ME-01.png",
    "F-IN-02.png", "F-CA-02.png", "F-AF-02.png", "F-EA-02.png", "F-ME-02.png",
    "M-IN-01.png", "M-CA-01.png", "M-AF-01.png", "M-EA-01.png", "M-ME-01.png",
    "M-IN-02.png", "M-CA-02.png", "M-AF-02.png", "M-EA-02.png", "M-ME-02.png",
    "K-B-01.png", "K-G-01.png", "K-B-02.png", "K-G-02.png",
]


def restore_originals() -> None:
    IDENTITIES_DIR.mkdir(parents=True, exist_ok=True)
    for name in PRODUCTION_FILES:
        src = SOURCE_DIR / name
        dst = IDENTITIES_DIR / name
        if not src.exists():
            raise SystemExit(f"missing source asset: {src}")
        shutil.copy2(src, dst)
        print(f"restored {name}")


def luminance(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(r: int, g: int, b: int) -> float:
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx == 0:
        return 0.0
    return (mx - mn) / mx


def is_background(r: int, g: int, b: int, tolerance: int) -> bool:
    """Studio sweep, floor shadow, warm/grey backdrop."""
    lum = luminance(r, g, b)
    sat = saturation(r, g, b)
    if lum >= 255 - tolerance and sat <= 0.08:
        return True
    if lum >= 220 - tolerance and sat <= 0.06:
        return True
    if lum >= 200 - tolerance and sat <= 0.04:
        return True
    return False


def flood_fill_background(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    visited = bytearray(w * h)
    bg = bytearray(w * h)

    def idx(x: int, y: int) -> int:
        return y * w + x

    queue: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        i = idx(x, y)
        if visited[i]:
            return
        r, g, b, _ = pixels[x, y]
        if is_background(r, g, b, tolerance=28):
            visited[i] = 1
            bg[i] = 1
            queue.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            i = idx(nx, ny)
            if visited[i]:
                continue
            r, g, b, _ = pixels[nx, ny]
            if is_background(r, g, b, tolerance=32):
                visited[i] = 1
                bg[i] = 1
                queue.append((nx, ny))

    # Remove isolated backdrop islands touching image edges via second pass
    for y in range(h):
        for x in range(w):
            i = idx(x, y)
            if bg[i]:
                pixels[x, y] = (255, 255, 255, 0)

    # Despill semi-transparent edge halos
    cleaned = rgba.copy()
    cp = cleaned.load()
    for y in range(h):
        for x in range(w):
            _, _, _, a = cp[x, y]
            if a == 0:
                continue
            r, g, b, _ = cp[x, y]
            if a < 255 and luminance(r, g, b) > 210 and saturation(r, g, b) < 0.08:
                cp[x, y] = (r, g, b, 0)

    return cleaned


def process_with_rembg(path: Path) -> bool:
    try:
        from rembg import remove
    except ImportError:
        return False

    with Image.open(path) as img:
        result = remove(img.convert("RGB"))
        if isinstance(result, bytes):
            from io import BytesIO
            result = Image.open(BytesIO(result))
        result = result.convert("RGBA")
        result.save(path, format="PNG", optimize=True)
    return True


def process_image(path: Path) -> None:
    if process_with_rembg(path):
        print(f"rembg {path.name}")
        return

    with Image.open(path) as img:
        result = flood_fill_background(img)
        result.save(path, format="PNG", optimize=True)
    print(f"flood-fill {path.name}")


def main() -> None:
    restore_originals()
    for name in PRODUCTION_FILES:
        process_image(IDENTITIES_DIR / name)


if __name__ == "__main__":
    main()
