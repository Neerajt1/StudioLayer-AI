#!/usr/bin/env python3
"""Sprint 3.1 — white-studio background removal → transparent PNG master assets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

IDENTITIES_DIR = Path(__file__).resolve().parents[1] / "public" / "identities"

# Production identity filenames (exclude TEST)
PRODUCTION_FILES = [
    "F-IN-01.png", "F-CA-01.png", "F-AF-01.png", "F-EA-01.png", "F-ME-01.png",
    "F-IN-02.png", "F-CA-02.png", "F-AF-02.png", "F-EA-02.png", "F-ME-02.png",
    "M-IN-01.png", "M-CA-01.png", "M-AF-01.png", "M-EA-01.png", "M-ME-01.png",
    "M-IN-02.png", "M-CA-02.png", "M-AF-02.png", "M-EA-02.png", "M-ME-02.png",
    "K-B-01.png", "K-G-01.png", "K-B-02.png", "K-G-02.png",
]

WHITE_THRESHOLD = 238
FEATHER = 12


def luminance(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def alpha_for_pixel(r: int, g: int, b: int) -> int:
    """Map near-white studio backdrop to transparent; preserve subject."""
    if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
        return 0
    # Soft edge for warm/grey studio falloff
    max_channel = max(r, g, b)
    min_channel = min(r, g, b)
    if max_channel - min_channel < 18 and luminance(r, g, b) > 210:
        fade = int((max_channel - 210) / (255 - 210) * 255)
        return max(0, min(255, fade))
    return 255


def process_image(path: Path) -> None:
    img = Image.open(path).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            na = alpha_for_pixel(r, g, b)
            pixels[x, y] = (r, g, b, min(a, na))

    # Second pass: feather edges
    feathered = img.copy()
    fp = feathered.load()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            _, _, _, a = pixels[x, y]
            if a == 0 or a == 255:
                continue
            neighbors = [pixels[x + dx, y + dy][3] for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))]
            if any(n == 0 for n in neighbors):
                fp[x, y] = (*pixels[x, y][:3], max(0, a - FEATHER // 2))

    feathered.save(path, format="PNG", optimize=True)
    print(f"processed {path.name}")


def main() -> None:
    for name in PRODUCTION_FILES:
        path = IDENTITIES_DIR / name
        if not path.exists():
            raise SystemExit(f"missing asset: {path}")
        process_image(path)


if __name__ == "__main__":
    main()
