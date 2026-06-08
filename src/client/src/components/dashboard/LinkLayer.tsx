import { useMemo, useState } from "react";

import type { ServiceLink, ServiceWithPosition } from "@shared";

import type { LinkPath } from "./linkUtils";
import { getLinkColor, orthogonalPath, SIDE_VEC } from "./linkUtils";
import {
  getNodeCenter,
  getNodeSize,
  getPortPosition,
  getSpreadPortPosition,
  NODE_HEIGHT,
  PortSide,
} from "./nodeGeometry";

const PORT_LABEL_W = 34; // port badge width (px)
const PORT_LABEL_H = 17; // port badge height (px)

interface LinkLayerProps {
  links: ServiceLink[];
  services: ServiceWithPosition[];
  dragOffsets: Record<string, { dx: number; dy: number }>;
  resizeDimensions: Record<string, { w: number; h: number }>;
  connectingSource: { serviceId: string; side: PortSide } | null;
  mouseCanvasPos: { x: number; y: number } | null;
  onEditLink: (link: ServiceLink) => void;
}

export function LinkLayer({
  links,
  services,
  dragOffsets,
  resizeDimensions,
  connectingSource,
  mouseCanvasPos,
  onEditLink,
}: LinkLayerProps) {
  const linkPaths = useMemo<LinkPath[]>(() => {
    // -- Pass 1: determine exit/entry sides for every link --
    interface SideAssignment {
      link: ServiceLink;
      exitSide: PortSide;
      entrySide: PortSide;
    }

    const assignments: (SideAssignment | null)[] = links.map((link) => {
      const srcCenter = getNodeCenter(link.sourceId, services, dragOffsets);
      const tgtCenter = getNodeCenter(link.targetId, services, dragOffsets);

      if (!srcCenter || !tgtCenter) return null;

      const sx = srcCenter.x;
      const sy = srcCenter.y;
      const tx = tgtCenter.x;
      const ty = tgtCenter.y;

      const srcIsParent = services.some((s) => s.position?.parentId === link.sourceId);
      const tgtIsParent = services.some((s) => s.position?.parentId === link.targetId);
      const srcParentId = services.find((s) => s.id === link.sourceId)?.position?.parentId;
      const tgtParentId = services.find((s) => s.id === link.targetId)?.position?.parentId;
      const srcIsParentOfTgt = tgtParentId === link.sourceId;
      const tgtIsParentOfSrc = srcParentId === link.targetId;

      let exitSide: PortSide;
      let entrySide: PortSide;

      if (srcIsParentOfTgt) {
        // Parent → its own child: exit from header bottom, enter child from top
        exitSide = PortSide.BOTTOM;
        entrySide = PortSide.TOP;
      } else if (tgtIsParentOfSrc) {
        // Child → its own parent: exit child from top, enter parent header bottom
        exitSide = PortSide.TOP;
        entrySide = PortSide.BOTTOM;
      } else {
        const ddx = tx - sx;
        const ddy = ty - sy;

        // Prefer top/bottom ports when nodes don't overlap on the Y axis.
        const srcH = (getNodeSize(link.sourceId)?.h ?? NODE_HEIGHT) / 2;
        const tgtH = (getNodeSize(link.targetId)?.h ?? NODE_HEIGHT) / 2;
        const yOverlap = sy - srcH <= ty + tgtH && ty - tgtH <= sy + srcH;

        if (!yOverlap) {
          exitSide = ddy >= 0 ? PortSide.BOTTOM : PortSide.TOP;
          entrySide = ddy >= 0 ? PortSide.TOP : PortSide.BOTTOM;
        } else {
          exitSide = ddx >= 0 ? PortSide.RIGHT : PortSide.LEFT;
          entrySide = ddx >= 0 ? PortSide.LEFT : PortSide.RIGHT;
        }

        // Upgrade BOTTOM to CONTAINER_BOTTOM for parent nodes on external links
        if (srcIsParent && exitSide === PortSide.BOTTOM) exitSide = PortSide.CONTAINER_BOTTOM;

        if (tgtIsParent && entrySide === PortSide.BOTTOM) entrySide = PortSide.CONTAINER_BOTTOM;
      }

      return { link, exitSide, entrySide };
    });

    // -- Group links per node side; each group shares one spread position --
    // Groups: "src" (all outgoing), "port:N" (incoming by target port), "no-port" (incoming, no port).
    // The GROUP is what gets a spread slot — links within the same group connect at the same point.
    type GroupMap = Map<string, string[]>; // subgroup key → link ids
    const nodeSideGroups = new Map<string, GroupMap>(); // "nodeId:side" → groups

    const ensureGroup = (nodeSide: string, sg: string) => {
      if (!nodeSideGroups.has(nodeSide)) nodeSideGroups.set(nodeSide, new Map());

      const m = nodeSideGroups.get(nodeSide)!;

      if (!m.has(sg)) m.set(sg, []);

      return m.get(sg)!;
    };

    const portGroup = (link: ServiceLink) =>
      link.targetPort != null ? `port:${link.targetPort}` : "no-port";

    for (const a of assignments) {
      if (!a) continue;

      ensureGroup(`${a.link.sourceId}:${a.exitSide}`, "src").push(a.link.id);
      ensureGroup(`${a.link.targetId}:${a.entrySide}`, portGroup(a.link)).push(a.link.id);
    }

    // Assign each group a spread index within its node side.
    // Sort order: src first, then port groups ascending, no-port last.
    const sgSortKey = (sg: string) =>
      sg === "src" ? -1 : sg === "no-port" ? Infinity : parseInt(sg.slice(5), 10);

    // "nodeId:side:subgroup" → { index, total } within that side
    const groupPos = new Map<string, { index: number; total: number }>();

    for (const [nodeSide, groups] of nodeSideGroups) {
      const sorted = [...groups.keys()].sort((a, b) => sgSortKey(a) - sgSortKey(b));

      sorted.forEach((sg, idx) =>
        groupPos.set(`${nodeSide}:${sg}`, { index: idx, total: sorted.length }),
      );
    }

    // -- Pass 2: compute spread port positions and build paths --
    return assignments
      .map((a) => {
        if (!a) return null;

        const { link, exitSide, entrySide } = a;
        const srcGp = groupPos.get(`${link.sourceId}:${exitSide}:src`)!;
        const tgtGp = groupPos.get(`${link.targetId}:${entrySide}:${portGroup(link)}`)!;

        const srcPort = getSpreadPortPosition(
          link.sourceId,
          exitSide,
          services,
          dragOffsets,
          srcGp.index,
          srcGp.total,
        );
        const tgtPort = getSpreadPortPosition(
          link.targetId,
          entrySide,
          services,
          dragOffsets,
          tgtGp.index,
          tgtGp.total,
        );

        if (!srcPort || !tgtPort) return null;

        const x1 = srcPort.x;
        const y1 = srcPort.y;
        const x2 = tgtPort.x;
        const y2 = tgtPort.y;

        return {
          id: link.id,
          d: orthogonalPath(x1, y1, exitSide, x2, y2, entrySide),
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
          endX: x2,
          endY: y2,
          entrySide,
          link,
          color: getLinkColor(link.type),
        };
      })
      .filter((p): p is LinkPath => p !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resizeDimensions invalidates DOM-based getNodeSize reads
  }, [links, services, dragOffsets, resizeDimensions]);

  const previewPath = useMemo(() => {
    if (!connectingSource || !mouseCanvasPos) return null;

    const srcPort = getPortPosition(
      connectingSource.serviceId,
      connectingSource.side,
      services,
      dragOffsets,
    );

    if (!srcPort) return null;

    const sx = srcPort.x;
    const sy = srcPort.y;
    const tx = mouseCanvasPos.x;
    const ty = mouseCanvasPos.y;

    const pdx = tx - sx;
    const pdy = ty - sy;
    let entrySide: PortSide;

    if (Math.abs(pdx) >= Math.abs(pdy)) {
      entrySide = pdx >= 0 ? PortSide.LEFT : PortSide.RIGHT;
    } else {
      entrySide = pdy >= 0 ? PortSide.TOP : PortSide.BOTTOM;
    }

    return orthogonalPath(sx, sy, connectingSource.side, tx, ty, entrySide);
  }, [connectingSource, mouseCanvasPos, services, dragOffsets]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {[...linkPaths]
        .sort((a, b) => (a.id === hoveredId ? 1 : b.id === hoveredId ? -1 : 0))
        .map((p) => {
          const hasPort = p.link.targetPort != null;
          const hovered = hoveredId === p.id;

          const [dx, dy] = SIDE_VEC[p.entrySide];
          const bx = p.endX + (dx * PORT_LABEL_W) / 2;
          const by = p.endY + (dy * PORT_LABEL_H) / 2;

          return (
            <g key={p.id}>
              <path
                d={p.d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDoubleClick={() => onEditLink(p.link)}
              />
              <path
                d={p.d}
                fill="none"
                stroke={hovered ? "var(--accent-blue-lighter)" : p.color}
                strokeWidth={hovered ? 2.5 : 2}
                strokeOpacity={hovered ? 1 : 0.6}
                style={{ pointerEvents: "none" }}
              />
              <path
                d={p.d}
                fill="none"
                stroke={hovered ? "var(--accent-blue-lighter)" : p.color}
                strokeWidth={hovered ? 7 : 6}
                strokeDasharray="6 4"
                strokeOpacity={hovered ? 0.65 : 0.4}
                style={{ pointerEvents: "none" }}
              />
              {p.link.label && (
                <text
                  x={p.midX}
                  y={p.midY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={15}
                  fill={p.color}
                  stroke="var(--bg-primary)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {p.link.label}
                </text>
              )}
              {hasPort && (
                <g style={{ pointerEvents: "none" }}>
                  <rect
                    x={bx - PORT_LABEL_W / 2}
                    y={by - PORT_LABEL_H / 2}
                    width={PORT_LABEL_W}
                    height={PORT_LABEL_H}
                    rx={3}
                    fill="var(--bg-card)"
                    stroke={p.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                  />
                  <text
                    x={bx}
                    y={by}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill={p.color}
                    fontFamily="monospace"
                    style={{ userSelect: "none" }}
                  >
                    {p.link.targetPort}
                  </text>
                </g>
              )}
            </g>
          );
        })}

      {previewPath && (
        <path
          d={previewPath}
          fill="none"
          stroke="var(--accent-blue-lighter)"
          strokeWidth={2}
          strokeDasharray="8 4"
          strokeOpacity={0.8}
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
