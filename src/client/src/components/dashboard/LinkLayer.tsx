import type { ServiceLink } from "@shared";
import type { LinkPath } from "./linkUtils";

interface LinkLayerProps {
  linkPaths: LinkPath[];
  previewPath: string | null;
  canvasW: number;
  canvasH: number;
  onEditLink: (link: ServiceLink) => void;
}

export function LinkLayer({
  linkPaths,
  previewPath,
  canvasW,
  canvasH,
  onEditLink,
}: LinkLayerProps) {
  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
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
        </g>
      ))}

      {previewPath && (
        <path
          d={previewPath}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeDasharray="8 4"
          strokeOpacity={0.8}
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
