#!/usr/bin/env python3
"""
Generate backend-only face-neutral Pose Master variants.

Outputs:
  artifacts/api-server/assets/pose-references-face-neutral/PoseN-face-neutral-backend.png

Does NOT modify frontend public/pose-references/PoseN.png display assets.
Regenerates PoseN-face-neutral-backend.png for all production poses.

Requires: opencv-python-headless (FaceDetectorYN), Pillow, numpy
YuNet model: downloaded to .tmp-face-neutral/ on first run.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
POSE_DIR = ROOT / "artifacts/studiolayer-ai/public/pose-references"
OUT_DIR = ROOT / "artifacts/api-server/assets/pose-references-face-neutral"
REGISTRY = ROOT / "artifacts/api-server/src/intelligence/pose-canonical-registry.json"
TMP = ROOT / ".tmp-face-neutral"
MODEL = TMP / "face_detection_yunet_2023mar.onnx"
MODEL_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)


PLATE_GRAY = 165
FEATHER = 16


def ensure_model() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    if MODEL.exists():
        return
    print("Downloading YuNet model...")
    urllib.request.urlretrieve(MODEL_URL, MODEL)


def best_face(img_bgr, detector):
    h, w = img_bgr.shape[:2]
    detector.setInputSize((w, h))
    _retval, faces = detector.detect(img_bgr)
    if faces is None or len(faces) == 0:
        return None
    candidates = []
    for f in faces:
        x, y, fw, fh = map(float, f[:4])
        score = float(f[-1])
        cy = y + fh / 2
        if score < 0.55:
            continue
        if cy > h * 0.48:
            continue
        if not (0.04 * w <= fw <= 0.40 * w):
            continue
        if not (0.8 <= (fh / max(fw, 1)) <= 2.2):
            continue
        rank = score * 2.0 - (cy / h) + min(fw / w, 0.25)
        candidates.append((rank, x, y, fw, fh, score))
    if not candidates:
        top = []
        for f in faces:
            x, y, fw, fh = map(float, f[:4])
            score = float(f[-1])
            cy = y + fh / 2
            if cy <= h * 0.55 and fw > 0.03 * w:
                top.append((score, x, y, fw, fh, score))
        if not top:
            return None
        top.sort(reverse=True)
        _, x, y, fw, fh, score = top[0]
        return x, y, fw, fh, score
    candidates.sort(reverse=True)
    _, x, y, fw, fh, score = candidates[0]
    return x, y, fw, fh, score


def silhouette_head_box(rgba: np.ndarray):
    h, w = rgba.shape[:2]
    lum = rgba[:, :, :3].astype(np.float32).max(axis=2)
    fg = lum > 28
    ys = np.where(fg.any(axis=1))[0]
    if len(ys) == 0:
        return None
    y0 = int(ys[0])
    y1 = int(ys[-1])
    person_h = max(y1 - y0, 1)
    head_h = int(np.clip(person_h * 0.20, h * 0.09, h * 0.32))
    band = fg[y0 : y0 + head_h]
    xs = np.where(band.any(axis=0))[0]
    if len(xs) == 0:
        return None
    x0, x1 = int(xs[0]), int(xs[-1])
    bw = x1 - x0
    pad = int(bw * 0.15)
    x0 += pad
    x1 -= pad
    return (
        float(x0),
        float(y0 + head_h * 0.08),
        float(max(x1 - x0, 1)),
        float(head_h * 0.92),
        0.0,
    )


def make_plate_mask(w, h, x, y, fw, fh):
    cx = x + fw / 2
    cy = y + fh * 0.52 + fh * 0.08
    rx = fw * 0.98
    ry = fh * 1.20
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=FEATHER))
    return np.array(mask, dtype=np.float32) / 255.0, (cx, cy, rx, ry)


def neutralize(src_path: Path, out_path: Path, detector):
    rgba = np.array(Image.open(src_path).convert("RGBA"))
    h, w = rgba.shape[:2]
    bgr = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
    face = best_face(bgr, detector)
    method = "yunet"
    if face is None:
        face = silhouette_head_box(rgba)
        method = "silhouette"
        if face is None:
            raise RuntimeError(f"no face/head for {src_path.name}")
    x, y, fw, fh, score = face
    alpha, geo = make_plate_mask(w, h, x, y, fw, fh)
    lum = rgba[:, :, :3].astype(np.float32).max(axis=2)
    fg_weight = np.clip((lum - 12) / 20.0, 0.0, 1.0)
    a = (alpha * fg_weight)[:, :, None]
    plate = np.zeros_like(rgba, dtype=np.float32)
    plate[:, :, 0:3] = PLATE_GRAY
    plate[:, :, 3] = rgba[:, :, 3]
    out = rgba.astype(np.float32) * (1.0 - a) + plate * a
    out = np.clip(out, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(out_path, optimize=True)
    return {
        "method": method,
        "score": float(score),
        "box": [
            round(float(x), 2),
            round(float(y), 2),
            round(float(fw), 2),
            round(float(fh), 2),
        ],
        "ellipse": {
            k: round(v, 2) for k, v in zip(("cx", "cy", "rx", "ry"), geo)
        },
    }


def main() -> None:
    ensure_model()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    poses = json.loads(REGISTRY.read_text())["poses"]
    detector = cv2.FaceDetectorYN_create(
        str(MODEL), "", (320, 320), 0.45, 0.3, 5000
    )
    results = []
    errors = []
    for entry in poses:
        pose_id = entry["poseId"]
        filename = entry["filename"]
        src = POSE_DIR / filename
        if not src.exists():
            errors.append({"poseId": pose_id, "error": f"missing {filename}"})
            continue
        out_path = OUT_DIR / f"{pose_id}-face-neutral-backend.png"
        try:
            meta = neutralize(src, out_path, detector)
            results.append(
                {
                    "poseId": pose_id,
                    "sourceFilename": src.name,
                    "backendFilename": out_path.name,
                    "identicalToSource": src.read_bytes()
                    == out_path.read_bytes(),
                    **meta,
                }
            )
            print(f"OK {pose_id} method={meta['method']}")
        except Exception as exc:  # noqa: BLE001
            errors.append({"poseId": pose_id, "error": str(exc)})
            print(f"FAIL {pose_id}: {exc}")

    manifest = {
        "version": 1,
        "purpose": (
            "Backend-only Stage-1 Pose Master face-neutral variants. "
            "Not for frontend display."
        ),
        "count": len(results),
        "plateGray": PLATE_GRAY,
        "poses": results,
        "errors": errors,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"generated={len(results)} errors={len(errors)}")


if __name__ == "__main__":
    main()
