import { useMemo, useState } from "react";
import type { ServiceLink, ServiceWithPosition } from "@shared";
import { orthogonalPath, getLinkColor } from "./linkUtils";
import type { LinkPath } from "./linkUtils";
import { getNodeCenter, getPortPosition, getChildForcedSide, type PortSide } from "./nodeGeometry";
import { colors } from "../../styles/vars";

interface LinkLayerProps {
  links: ServiceLink[];
  services: ServiceWithPosition[];
  dragOffsets: Record<string, { dx: number; dy: number }>;
  panOffset: { x: number; y: number };
  zoomLevel: number;
  connectingSource: { serviceId: string; side: PortSide } | null;
  mouseCanvasPos: { x: number; y: number } | null;
  canvasW: number;
  canvasH: number;
  onEditLink: (link: ServiceLink) => void;
}

export function LinkLayer({
  links,
  services,
  dragOffsets,
  panOffset,
  zoomLevel,
  connectingSource,
  mouseCanvasPos,
  canvasW,
  canvasH,
  onEditLink,
}: LinkLayerProps) {
  const linkPaths = useMemo<LinkPath[]>(() => {
    return links
      .map((link) => {
        const srcCenter = getNodeCenter(link.source_id, services, dragOffsets);
        const tgtCenter = getNodeCenter(link.target_id, services, dragOffsets);

        if (!srcCenter || !tgtCenter) return null;

        const sx = srcCenter.x * zoomLevel + panOffset.x;
        const sy = srcCenter.y * zoomLevel + panOffset.y;
        const tx = tgtCenter.x * zoomLevel + panOffset.x;
        const ty = tgtCenter.y * zoomLevel + panOffset.y;

        const srcParentId = services.find((s) => s.id === link.source_id)?.position?.parent_id;
        const tgtParentId = services.find((s) => s.id === link.target_id)?.position?.parent_id;
        const areSiblings = srcParentId && tgtParentId && srcParentId === tgtParentId;

        const flipSide = (side: PortSide | null): PortSide | null =>
          side === "left" ? "right" : side === "right" ? "left" : side;

        const srcForced = areSiblings
          ? flipSide(getChildForcedSide(link.source_id, services))
          : getChildForcedSide(link.source_id, services);
        const tgtForced = areSiblings
          ? flipSide(getChildForcedSide(link.target_id, services))
          : getChildForcedSide(link.target_id, services);

        let exitSide: PortSide | null = srcForced;
        let entrySide: PortSide | null = tgtForced;

        if (!exitSide || !tgtForced) {
          const ddx = tx - sx;
          const ddy = ty - sy;
          const useHorizontal = Math.abs(ddx) >= Math.abs(ddy);

          if (!srcForced) {
            exitSide = useHorizontal ? (ddx >= 0 ? "right" : "left") : ddy >= 0 ? "bottom" : "top";
          }

          if (!tgtForced) {
            entrySide = useHorizontal ? (ddx >= 0 ? "left" : "right") : ddy >= 0 ? "top" : "bottom";
          }
        }

        const srcPort = getPortPosition(link.source_id, exitSide!, services, dragOffsets);
        const tgtPort = getPortPosition(link.target_id, entrySide!, services, dragOffsets);

        if (!srcPort || !tgtPort) return null;

        const x1 = srcPort.x * zoomLevel + panOffset.x;
        const y1 = srcPort.y * zoomLevel + panOffset.y;
        const x2 = tgtPort.x * zoomLevel + panOffset.x;
        const y2 = tgtPort.y * zoomLevel + panOffset.y;

        return {
          id: link.id,
          d: orthogonalPath(x1, y1, exitSide!, x2, y2, entrySide!, zoomLevel),
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
          endX: x2,
          endY: y2,
          entrySide: entrySide!,
          link,
          color: getLinkColor(link.type),
        };
      })
      .filter((p): p is LinkPath => p !== null);
  }, [links, services, dragOffsets, panOffset, zoomLevel]);

  const previewPath = useMemo(() => {
    if (!connectingSource || !mouseCanvasPos) return null;

    const srcPort = getPortPosition(
      connectingSource.serviceId,
      connectingSource.side,
      services,
      dragOffsets,
    );

    if (!srcPort) return null;

    const sx = srcPort.x * zoomLevel + panOffset.x;
    const sy = srcPort.y * zoomLevel + panOffset.y;
    const tx = mouseCanvasPos.x * zoomLevel + panOffset.x;
    const ty = mouseCanvasPos.y * zoomLevel + panOffset.y;

    const pdx = tx - sx;
    const pdy = ty - sy;
    let entrySide: PortSide;

    if (Math.abs(pdx) >= Math.abs(pdy)) {
      entrySide = pdx >= 0 ? "left" : "right";
    } else {
      entrySide = pdy >= 0 ? "top" : "bottom";
    }

    return orthogonalPath(sx, sy, connectingSource.side, tx, ty, entrySide, zoomLevel);
  }, [connectingSource, mouseCanvasPos, services, dragOffsets, panOffset, zoomLevel]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {[...linkPaths]
        .sort((a, b) => (a.id === hoveredId ? 1 : b.id === hoveredId ? -1 : 0))
        .map((p) => {
          const boxW = 34 * zoomLevel;
          const boxH = 17 * zoomLevel;
          const hasPort = p.link.targetPort != null;
          const hovered = hoveredId === p.id;

          const portBoxOffset = {
            left: { cx: -boxW / 2, cy: 0 },
            right: { cx: boxW / 2, cy: 0 },
            top: { cx: 0, cy: -boxH / 2 },
            bottom: { cx: 0, cy: boxH / 2 },
          }[p.entrySide];

          const bx = p.endX + portBoxOffset.cx;
          const by = p.endY + portBoxOffset.cy;

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
                stroke={hovered ? colors.accentBlueLighter : p.color}
                strokeWidth={hovered ? 2.5 : 2}
                strokeOpacity={hovered ? 1 : 0.6}
                style={{ pointerEvents: "none" }}
              />
              <path
                d={p.d}
                fill="none"
                stroke={hovered ? colors.accentBlueLighter : p.color}
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
                  stroke={colors.bgPrimary}
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
                    x={bx - boxW / 2}
                    y={by - boxH / 2}
                    width={boxW}
                    height={boxH}
                    rx={3 * zoomLevel}
                    fill={colors.bgCard}
                    stroke={p.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                  />
                  <text
                    x={bx}
                    y={by}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10 * zoomLevel}
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
          stroke={colors.accentBlueLighter}
          strokeWidth={2}
          strokeDasharray="8 4"
          strokeOpacity={0.8}
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
