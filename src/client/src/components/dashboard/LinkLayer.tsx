import { useMemo } from "react";
import type { ServiceLink, ServiceWithPosition } from "@shared";
import { orthogonalPath, getLinkColor } from "./linkUtils";
import type { LinkPath } from "./linkUtils";
import {
  getNodeCenter,
  getNodeSize,
  getPortPosition,
  getChildForcedSide,
  portCoords,
  type PortSide,
} from "./nodeGeometry";
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

        const srcSize = getNodeSize(link.source_id);
        const tgtSize = getNodeSize(link.target_id);

        if (!srcSize || !tgtSize) return null;

        const { w: srcW, h: srcH } = srcSize;
        const { w: tgtW, h: tgtH } = tgtSize;
        const srcHalfW = (srcW * zoomLevel) / 2;
        const srcHalfH = (srcH * zoomLevel) / 2;
        const tgtHalfW = (tgtW * zoomLevel) / 2;
        const tgtHalfH = (tgtH * zoomLevel) / 2;

        const srcForced = getChildForcedSide(link.source_id, services);
        const tgtForced = getChildForcedSide(link.target_id, services);

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

        const { x: x1, y: y1 } = portCoords(sx, sy, exitSide!, srcHalfW, srcHalfH);
        const { x: x2, y: y2 } = portCoords(tx, ty, entrySide!, tgtHalfW, tgtHalfH);

        return {
          id: link.id,
          d: orthogonalPath(x1, y1, exitSide!, x2, y2, entrySide!, zoomLevel),
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
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
      {linkPaths.map((p) => (
        <g key={p.id}>
          <path
            d={p.d}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ cursor: "pointer", pointerEvents: "stroke" }}
            onDoubleClick={() => onEditLink(p.link)}
          />
          <path
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeOpacity={0.6}
            style={{ pointerEvents: "none" }}
          />
          <path
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={6}
            strokeDasharray="6 4"
            strokeOpacity={0.4}
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
        </g>
      ))}

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
