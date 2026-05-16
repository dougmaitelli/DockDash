import { LINK_TYPES } from "../../types";
import type { ServiceLink } from "@shared";
import type { PortSide } from "./nodeGeometry";

export interface LinkPath {
  id: string;
  d: string;
  link: ServiceLink;
  color: string;
}

export function getLinkColor(type: string): string {
  const linkType = LINK_TYPES.find((lt) => lt.value === type);
  return linkType?.color || "#6b7280";
}

const SIDE_VEC: Record<PortSide, [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  bottom: [0, 1],
  top: [0, -1],
};

const MIN_SEG = 40; // minimum stub length before first turn
const CORNER_R = 10; // corner radius

export function orthogonalPath(
  x1: number,
  y1: number,
  exitSide: PortSide,
  x2: number,
  y2: number,
  entrySide: PortSide,
  zoom: number = 1,
): string {
  const [ev1x, ev1y] = SIDE_VEC[exitSide];
  const [ev2x, ev2y] = SIDE_VEC[entrySide];

  const minSeg = MIN_SEG * zoom;

  // Stub endpoints — the first/last straight segments leaving each node
  const ex = x1 + ev1x * minSeg;
  const ey = y1 + ev1y * minSeg;
  const enx = x2 + ev2x * minSeg;
  const eny = y2 + ev2y * minSeg;

  const isHorizExit = exitSide === "left" || exitSide === "right";
  const isHorizEntry = entrySide === "left" || entrySide === "right";

  let midPoints: [number, number][] = [];

  if (exitSide === entrySide) {
    // Same side — U-shape that goes around the outside
    if (isHorizExit) {
      const outerX = exitSide === "right" ? Math.max(ex, enx) : Math.min(ex, enx);
      midPoints = [
        [outerX, ey],
        [outerX, eny],
      ];
    } else {
      const outerY = exitSide === "bottom" ? Math.max(ey, eny) : Math.min(ey, eny);
      midPoints = [
        [ex, outerY],
        [enx, outerY],
      ];
    }
  } else if (isHorizExit && isHorizEntry) {
    // Both horizontal (right→left or left→right)
    const stubsCross = (exitSide === "right" && ex > enx) || (exitSide === "left" && ex < enx);
    if (stubsCross) {
      // Nodes too close — route around via horizontal midY to avoid 180° turn
      const midY = (y1 + y2) / 2;
      midPoints = [
        [ex, midY],
        [enx, midY],
      ];
    } else {
      const midX = (ex + enx) / 2;
      midPoints = [
        [midX, ey],
        [midX, eny],
      ];
    }
  } else if (!isHorizExit && !isHorizEntry) {
    // Both vertical (top→bottom or bottom→top)
    const stubsCross = (exitSide === "bottom" && ey > eny) || (exitSide === "top" && ey < eny);
    if (stubsCross) {
      // Nodes too close — route around via vertical midX
      const midX = (x1 + x2) / 2;
      midPoints = [
        [midX, ey],
        [midX, eny],
      ];
    } else {
      const midY = (ey + eny) / 2;
      midPoints = [
        [ex, midY],
        [enx, midY],
      ];
    }
  } else if (isHorizExit && !isHorizEntry) {
    // Horizontal exit, vertical entry — single L-corner
    midPoints = [[enx, ey]];
  } else {
    // Vertical exit, horizontal entry — single L-corner
    midPoints = [[ex, eny]];
  }

  const pts: [number, number][] = [[x1, y1], [ex, ey], ...midPoints, [enx, eny], [x2, y2]];

  // Remove consecutive duplicate points
  const deduped = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);

  return buildRoundedPath(deduped, CORNER_R);
}

function buildRoundedPath(points: [number, number][], r: number): string {
  if (points.length < 2) return "";

  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];

    const d1x = cx - px;
    const d1y = cy - py;
    const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const d2x = nx - cx;
    const d2y = ny - cy;
    const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

    if (len1 < 0.001 || len2 < 0.001) {
      d += ` L ${cx} ${cy}`;
      continue;
    }

    const actualR = Math.min(r, len1 / 2, len2 / 2);
    const p1x = cx - (d1x / len1) * actualR;
    const p1y = cy - (d1y / len1) * actualR;
    const p2x = cx + (d2x / len2) * actualR;
    const p2y = cy + (d2y / len2) * actualR;

    d += ` L ${p1x} ${p1y} Q ${cx} ${cy} ${p2x} ${p2y}`;
  }

  const [lx, ly] = points[points.length - 1];
  d += ` L ${lx} ${ly}`;

  return d;
}
