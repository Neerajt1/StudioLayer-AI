#!/usr/bin/env python3
"""
Generate Phase-1 Direct Shoot controlled editorial grid layout (presentation-only).

~4 substantial poses per row; cropped poses subordinate; focal full-body accents.
"""
from __future__ import annotations

import json
import struct
import zlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/data"
PUBLIC = ROOT / "public"

BOARD_W = 1000
PADDING_X = 16
PADDING_Y = 36
ROW_GAP = 32
COL_GAP = 12
FINALE_GAP = 48
VISUAL_GAP = 8
LAYOUT_SEED = 0x5C0DE004

FINALE_POSE_IDS = ("Pose53", "Pose57", "Pose58", "Pose59", "Pose60")
FOCAL_POSE_IDS = ("Pose17", "Pose50", "Pose22", "Pose27", "Pose36")
CORNER_POSE_ID = "Pose57"

ACCENT_WEIGHT = 1.07
BASE_WEIGHT = 1.0
CROPPED_WEIGHT = 0.78


@dataclass
class PoseMeta:
    name: str
    pose_id: str
    aspect: float
    edges: list[str] = field(default_factory=list)

    @property
    def is_cropped(self) -> bool:
        return len(self.edges) > 0

    @property
    def edge(self) -> str | None:
        return self.edges[0] if self.edges else None


@dataclass
class Placement:
    pose_name: str
    left: float
    top: float
    width: float
    height: float
    z_index: int
    tier: str
    edge_anchor: str | None
    object_position: str
    transform_origin: str
    section: str


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    return struct.unpack(">II", data[16:24])


def alpha_bounds(path: Path) -> tuple[int, int, int, int, int, int]:
    data = path.read_bytes()
    w, h = struct.unpack(">II", data[16:24])
    pos = 8
    raw = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos : pos + 4])[0]
        ct = data[pos + 4 : pos + 8]
        cd = data[pos + 8 : pos + 8 + ln]
        if ct == b"IDAT":
            raw += cd
        elif ct == b"IEND":
            break
        pos += 12 + ln
    inflated = zlib.decompress(raw)
    left = top = right = bottom = None
    idx = 0
    for y in range(h):
        idx += 1
        for x in range(w):
            if inflated[idx + 3] > 12:
                if left is None:
                    left, top, right, bottom = x, y, x, y
                else:
                    left = min(left, x)
                    top = min(top, y)
                    right = max(right, x)
                    bottom = max(bottom, y)
            idx += 4
    if left is None:
        return w, h, 0, 0, w - 1, h - 1
    return w, h, left, top, right, bottom


def detect_edges(img_w: int, img_h: int, left: int, top: int, right: int, bottom: int) -> list[str]:
    fill_w = (right - left + 1) / max(1, img_w)
    fill_h = (bottom - top + 1) / max(1, img_h)
    edges: list[str] = []
    if left <= img_w * 0.06 and fill_w < 0.9:
        edges.append("left")
    if right >= img_w * 0.94 and fill_w < 0.9:
        edges.append("right")
    if top <= img_h * 0.06 and fill_h < 0.9:
        edges.append("top")
    if bottom >= img_h * 0.94 and fill_h < 0.9:
        edges.append("bottom")
    return edges


def anchor_styles(edges: list[str]) -> tuple[str, str]:
    if "left" in edges and "bottom" in edges:
        return "left bottom", "left bottom"
    if "right" in edges and "bottom" in edges:
        return "right bottom", "right bottom"
    if "left" in edges:
        return "left bottom", "left bottom"
    if "right" in edges:
        return "right bottom", "right bottom"
    if "top" in edges:
        return "center top", "center top"
    if "bottom" in edges:
        return "center bottom", "center bottom"
    return "center bottom", "center bottom"


def order_row_poses(poses: list[PoseMeta]) -> list[PoseMeta]:
    left_crops = [p for p in poses if "left" in p.edges]
    right_crops = [p for p in poses if "right" in p.edges and "left" not in p.edges]
    middle = [p for p in poses if not p.is_cropped]
    return left_crops + middle + right_crops


def row_inner_width(n: int) -> float:
    return BOARD_W - 2 * PADDING_X - (n - 1) * COL_GAP


def cropped_slot_width() -> float:
    """Subordinate cropped pose width — matches ~one slot in a 4-pose row."""
    return (row_inner_width(4) / 4) * CROPPED_WEIGHT


def pose_weight(pose: PoseMeta, is_accent: bool) -> float:
    if pose.is_cropped:
        return CROPPED_WEIGHT
    if is_accent:
        return ACCENT_WEIGHT
    return BASE_WEIGHT


def compute_widths(ordered: list[PoseMeta], accent_index: int | None) -> list[float]:
    n = len(ordered)
    weights = [
        pose_weight(pose, accent_index is not None and i == accent_index and not pose.is_cropped)
        for i, pose in enumerate(ordered)
    ]
    inner = row_inner_width(n)
    total = sum(weights)
    return [inner * (w / total) for w in weights]


def layout_row_x_positions(ordered: list[PoseMeta], widths: list[float]) -> list[float]:
    """Sequential pack with edge snap; edge crops stack inward from boundaries."""
    n = len(ordered)
    xs = [0.0] * n

    left_indices = [i for i, p in enumerate(ordered) if "left" in p.edges]
    right_indices = [i for i, p in enumerate(ordered) if "right" in p.edges]
    middle_indices = [i for i in range(n) if i not in left_indices and i not in right_indices]

    # Left crops stack from x=0 inward.
    edge_x = 0.0
    for i in left_indices:
        xs[i] = edge_x
        edge_x += widths[i] + COL_GAP

    # Middle poses continue the row.
    x = edge_x if left_indices else float(PADDING_X)
    for i in middle_indices:
        xs[i] = x
        x += widths[i] + COL_GAP

    # Right crops stack from board edge inward.
    edge_x = float(BOARD_W)
    for i in reversed(right_indices):
        w = widths[i]
        xs[i] = edge_x - w
        edge_x = xs[i] - COL_GAP

    return xs


def choose_accent_index(ordered: list[PoseMeta], row_index: int, focal_ids: set[str]) -> int | None:
    for i, pose in enumerate(ordered):
        if pose.pose_id in focal_ids and not pose.is_cropped:
            return i
    non_cropped = [i for i, p in enumerate(ordered) if not p.is_cropped]
    if not non_cropped:
        return None
    return non_cropped[1 if row_index % 2 == 0 else min(2, len(non_cropped) - 1)]


def bbox(p: Placement) -> tuple[float, float, float, float]:
    return p.left, p.top, p.left + p.width, p.top + p.height


def overlaps(a: tuple[float, float, float, float], b: tuple[float, float, float, float], gap: float) -> bool:
    return not (
        a[2] + gap <= b[0]
        or b[2] + gap <= a[0]
        or a[3] + gap <= b[1]
        or b[3] + gap <= a[1]
    )


def resolve_row_collisions(placements: list[Placement], gap: float = VISUAL_GAP) -> None:
    """Nudge poses within a row until axis-aligned boxes clear."""
    if len(placements) < 2:
        return

    for _ in range(32):
        moved = False
        for i in range(len(placements)):
            for j in range(i + 1, len(placements)):
                a = bbox(placements[i])
                b = bbox(placements[j])
                if not overlaps(a, b, gap):
                    continue
                overlap_w = min(a[2], b[2]) - max(a[0], b[0])
                if overlap_w > 0:
                    shift = (overlap_w + gap) / 2 + 0.5
                    if a[0] <= b[0]:
                        placements[i].left -= shift
                        placements[j].left += shift
                    else:
                        placements[i].left += shift
                        placements[j].left -= shift
                    moved = True
        if not moved:
            break


def pack_row(
    row_poses: list[PoseMeta],
    row_y: float,
    row_index: int,
    z_start: int,
    section: str,
    focal_ids: set[str],
    y_jitter: float = 0.0,
) -> tuple[list[Placement], float, int]:
    ordered = order_row_poses(row_poses)
    accent_index = choose_accent_index(ordered, row_index, focal_ids)

    weights = [
        pose_weight(pose, accent_index is not None and i == accent_index)
        for i, pose in enumerate(ordered)
    ]
    inner = row_inner_width(len(ordered))
    total = sum(weights)
    widths = [inner * (w / total) for w in weights]
    heights = [widths[i] * ordered[i].aspect for i in range(len(ordered))]
    row_height = max(heights)
    xs = layout_row_x_positions(ordered, widths)

    placements: list[Placement] = []
    z = z_start

    for i, pose in enumerate(ordered):
        w = widths[i]
        h = heights[i]
        jitter = y_jitter if not pose.is_cropped and i % 2 == row_index % 2 else 0.0
        y = row_y + (row_height - h) + jitter
        obj_pos, origin = anchor_styles(pose.edges)
        tier = "accent" if accent_index == i and not pose.is_cropped else "standard"

        placements.append(
            Placement(
                pose_name=pose.name,
                left=xs[i],
                top=y,
                width=w,
                height=h,
                z_index=z,
                tier=tier,
                edge_anchor=pose.edge,
                object_position=obj_pos,
                transform_origin=origin,
                section=section,
            )
        )
        z += 1

    resolve_row_collisions(placements)
    return placements, row_height + abs(y_jitter), z


def pack_centered_row(
    row_poses: list[PoseMeta],
    row_y: float,
    z_start: int,
    section: str,
    focal_ids: set[str],
) -> tuple[list[Placement], float, int]:
    ordered = order_row_poses(row_poses)
    accent_index = choose_accent_index(ordered, 0, focal_ids)

    weights = [pose_weight(pose, accent_index == i) for i, pose in enumerate(ordered)]
    inner = row_inner_width(len(ordered))
    total = sum(weights)
    widths = [inner * (w / total) for w in weights]
    heights = [widths[i] * ordered[i].aspect for i in range(len(ordered))]
    row_height = max(heights)
    total_w = sum(widths) + (len(ordered) - 1) * COL_GAP
    start_x = (BOARD_W - total_w) / 2

    placements: list[Placement] = []
    z = z_start
    x = start_x

    for i, pose in enumerate(ordered):
        w = widths[i]
        h = heights[i]
        left = 0.0 if "left" in pose.edges else x
        y = row_y + (row_height - h)
        obj_pos, origin = anchor_styles(pose.edges)
        placements.append(
            Placement(
                pose_name=pose.name,
                left=left,
                top=y,
                width=w,
                height=h,
                z_index=z,
                tier="accent" if accent_index == i and not pose.is_cropped else "standard",
                edge_anchor=pose.edge,
                object_position=obj_pos,
                transform_origin=origin,
                section=section,
            )
        )
        z += 1
        if "left" not in pose.edges:
            x += w + COL_GAP

    resolve_row_collisions(placements)
    return placements, row_height, z


def pack_finale_duo(
    poses: list[PoseMeta],
    row_y: float,
    z_start: int,
) -> tuple[list[Placement], float, int]:
    """Pose53 + Pose60 — centred portrait pair."""
    return pack_centered_row(poses, row_y, z_start, "finale", set())


def pack_finale_pair(
    poses: list[PoseMeta],
    row_y: float,
    z_start: int,
) -> tuple[list[Placement], float, int]:
    left_pose = next(p for p in poses if "left" in p.edges)
    other = next(p for p in poses if p.name != left_pose.name)
    ordered = [left_pose, other]

    w_left = cropped_slot_width()
    w_right = (row_inner_width(4) / 4) * BASE_WEIGHT
    widths = [w_left, w_right]
    heights = [widths[i] * ordered[i].aspect for i in range(2)]
    row_height = max(heights)

    placements: list[Placement] = []
    z = z_start

    xs = [0.0, PADDING_X + cropped_slot_width() + COL_GAP * 2]
    for i, pose in enumerate(ordered):
        w, h = widths[i], heights[i]
        y = row_y + (row_height - h)
        obj_pos, origin = anchor_styles(pose.edges)
        placements.append(
            Placement(
                pose_name=pose.name,
                left=xs[i],
                top=y,
                width=w,
                height=h,
                z_index=z,
                tier="standard",
                edge_anchor=pose.edge,
                object_position=obj_pos,
                transform_origin=origin,
                section="finale",
            )
        )
        z += 1

    resolve_row_collisions(placements)
    return placements, row_height, z


def place_pose57_corner(pose: PoseMeta, board_h: float, z: int) -> Placement:
    """Bottom-right corner — right and bottom flush with board boundary."""
    w = cropped_slot_width()
    h = w * pose.aspect
    top = board_h - h
    left = BOARD_W - w
    obj_pos, origin = "right bottom", "right bottom"
    return Placement(
        pose_name=pose.name,
        left=left,
        top=top,
        width=w,
        height=h,
        z_index=z,
        tier="standard",
        edge_anchor="right",
        object_position=obj_pos,
        transform_origin=origin,
        section="finale",
    )


def snap_pose57_corner(p: Placement, board_h: float) -> None:
    p.top = board_h - p.height
    p.left = BOARD_W - p.width


def resolve_cross_row_collisions(all_placements: list[Placement], gap: float = VISUAL_GAP) -> None:
    for _ in range(16):
        moved = False
        for i in range(len(all_placements)):
            for j in range(i + 1, len(all_placements)):
                a = bbox(all_placements[i])
                b = bbox(all_placements[j])
                if not overlaps(a, b, gap):
                    continue
                # Do not shrink; nudge lower pose down slightly.
                lower = all_placements[j] if all_placements[j].top >= all_placements[i].top else all_placements[i]
                overlap_h = min(a[3], b[3]) - max(a[1], b[1])
                if overlap_h > 0:
                    lower.top += overlap_h + gap
                    moved = True
        if not moved:
            break


def main() -> None:
    names: list[str] = json.loads((DATA / "pose-library-names.json").read_text())
    refs: dict[str, str] = json.loads((DATA / "pose-reference-manifest.json").read_text())["images"]
    bridge = json.loads((DATA / "pose-catalog-bridge.json").read_text())
    id_by_name = {v: k for k, v in bridge["poseIdToCatalogName"].items()}

    finale_names = {bridge["poseIdToCatalogName"][pid] for pid in FINALE_POSE_IDS}
    focal_ids = set(FOCAL_POSE_IDS)

    meta_by_name: dict[str, PoseMeta] = {}
    for name in names:
        pose_id = id_by_name.get(name, "")
        path = PUBLIC / refs[name].lstrip("/")
        img_w, img_h = png_size(path)
        _, _, left, top, right, bottom = alpha_bounds(path)
        edges = detect_edges(img_w, img_h, left, top, right, bottom)
        if pose_id == CORNER_POSE_ID:
            edges = ["right", "bottom"]
        meta_by_name[name] = PoseMeta(
            name=name,
            pose_id=pose_id,
            aspect=img_h / img_w,
            edges=edges,
        )

    main_names = [n for n in names if n not in finale_names]
    if len(main_names) != 70:
        raise RuntimeError(f"Expected 70 main poses, got {len(main_names)}")

    placements: list[Placement] = []
    row_y = float(PADDING_Y)
    z = 1
    cursor = 0
    row_index = 0

    while cursor < len(main_names):
        remaining = len(main_names) - cursor
        row_size = 4 if remaining >= 4 else remaining
        row_poses = [meta_by_name[main_names[cursor + i]] for i in range(row_size)]
        cursor += row_size

        if row_size == 4:
            row_placements, row_height, z = pack_row(
                row_poses, row_y, row_index, z, "main", focal_ids, y_jitter=0.0
            )
        else:
            row_placements, row_height, z = pack_centered_row(
                row_poses, row_y, z, "main", focal_ids
            )

        placements.extend(row_placements)
        row_y += row_height + ROW_GAP
        row_index += 1

    row_y += FINALE_GAP - ROW_GAP

    pose57_name = bridge["poseIdToCatalogName"][CORNER_POSE_ID]
    finale_duo = [
        meta_by_name[bridge["poseIdToCatalogName"]["Pose53"]],
        meta_by_name[bridge["poseIdToCatalogName"]["Pose60"]],
    ]
    finale_pair = [
        meta_by_name[bridge["poseIdToCatalogName"]["Pose58"]],
        meta_by_name[bridge["poseIdToCatalogName"]["Pose59"]],
    ]

    row_placements, row_height, z = pack_finale_duo(finale_duo, row_y, z)
    placements.extend(row_placements)
    row_y += row_height + ROW_GAP

    row_placements, row_height, z = pack_finale_pair(finale_pair, row_y, z)
    placements.extend(row_placements)
    row_y += row_height

    board_h = row_y + PADDING_Y

    pose57 = meta_by_name[pose57_name]
    pose57_placement = place_pose57_corner(pose57, board_h, z)
    board_h = pose57_placement.top + pose57_placement.height
    pose57_placement.top = board_h - pose57_placement.height
    pose57_placement.left = BOARD_W - pose57_placement.width
    placements.append(pose57_placement)

    # Final overlap pass (preserve Pose57 corner anchor).
    corner_name = pose57_name
    main_placements = [p for p in placements if p.pose_name != corner_name]
    resolve_cross_row_collisions(main_placements)
    snap_pose57_corner(pose57_placement, board_h)

    out_placements = {
        p.pose_name: {
            "left": round(p.left / BOARD_W * 100, 3),
            "top": round(p.top / board_h * 100, 3),
            "width": round(p.width / BOARD_W * 100, 3),
            "height": round(p.height / board_h * 100, 3),
            "zIndex": p.z_index,
            "tier": p.tier,
            "edgeAnchor": p.edge_anchor,
            "objectPosition": p.object_position,
            "transformOrigin": p.transform_origin,
            "section": p.section,
        }
        for p in placements
    }

    widths_pct = [p["width"] for p in out_placements.values()]
    payload = {
        "version": "PHASE-1-EDITORIAL-GRID-V2.1",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "seed": hex(LAYOUT_SEED),
        "boardWidthUnits": BOARD_W,
        "boardHeightUnits": round(board_h),
        "boardAspectRatio": round(BOARD_W / board_h, 4),
        "poseCount": len(placements),
        "finalePoseIds": list(FINALE_POSE_IDS),
        "focalPoseIds": list(FOCAL_POSE_IDS),
        "minPoseWidthPct": round(min(widths_pct), 3),
        "maxPoseWidthPct": round(max(widths_pct), 3),
        "placements": out_placements,
    }

    out_path = DATA / "pose-curated-board-layout.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"Placed {len(placements)} poses")
    print(f"Board: {BOARD_W} x {round(board_h)}")
    print(f"Pose width %: min={payload['minPoseWidthPct']} max={payload['maxPoseWidthPct']}")

    # Overlap audit
    W, H = BOARD_W, board_h
    boxes = []
    for name, p in out_placements.items():
        l, t = p["left"] / 100 * W, p["top"] / 100 * H
        r, b = l + p["width"] / 100 * W, t + p["height"] / 100 * H
        boxes.append((name, l, t, r, b))
    for i, (n1, *a) in enumerate(boxes):
        for n2, *bb in boxes[i + 1 :]:
            if overlaps(tuple(a), tuple(bb), VISUAL_GAP):
                print(f"WARNING overlap: {n1} vs {n2}")
    print(f"Written: {out_path}")


if __name__ == "__main__":
    main()
