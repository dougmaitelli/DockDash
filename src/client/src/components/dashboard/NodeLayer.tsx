import type { MouseEvent as ReactMouseEvent } from "react";
import type { ServiceWithPosition } from "@shared";
import { ServiceNodeInner } from "./ServiceNode";
import { NODE_WIDTH, NODE_HEIGHT, type PortSide } from "./nodeGeometry";

interface NodeLayerProps {
  services: ServiceWithPosition[];
  dragOffsets: Record<string, { dx: number; dy: number }>;
  selectedId: string | null;
  hoveredNode: string | null;
  connectingSource: { serviceId: string; side: PortSide } | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDoubleClick: (service: ServiceWithPosition) => void;
  onDragStart: (e: ReactMouseEvent, serviceId: string) => void;
  onPortMouseDown: (e: ReactMouseEvent, serviceId: string, side: PortSide) => void;
  onPortMouseEnter: (serviceId: string) => void;
  onPortMouseLeave: () => void;
  onNodeMouseEnter: (serviceId: string) => void;
  onNodeMouseLeave: () => void;
}

export function NodeLayer({
  services,
  dragOffsets,
  selectedId,
  hoveredNode,
  connectingSource,
  onSelect,
  onHover,
  onDoubleClick,
  onDragStart,
  onPortMouseDown,
  onPortMouseEnter,
  onPortMouseLeave,
  onNodeMouseEnter,
  onNodeMouseLeave,
}: NodeLayerProps) {
  return (
    <>
      {services.map((service, idx) => {
        const pos = service.position;
        const offset = dragOffsets[service.id!];
        const dragX = offset?.dx || 0;
        const dragY = offset?.dy || 0;

        let x: number;
        let y: number;

        if (pos) {
          x = pos.x + dragX;
          y = pos.y + dragY;
        } else {
          const cols = Math.max(3, Math.ceil(Math.sqrt(services.length)));
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const gapX = 60;
          const gapY = 80;

          x = 100 + col * (NODE_WIDTH + gapX) + dragX;
          y = 120 + row * (NODE_HEIGHT + gapY) + dragY;
        }

        return (
          <div
            key={service.id}
            style={{
              position: "absolute",
              left: `${x}px`,
              top: `${y}px`,
              zIndex: selectedId === service.id ? 10 : hoveredNode === service.id ? 5 : 1,
              pointerEvents: "auto",
            }}
          >
            <ServiceNodeInner
              service={service}
              isSelected={selectedId === service.id}
              isHovered={hoveredNode === service.id}
              onSelect={onSelect}
              onDoubleClick={() => onDoubleClick(service)}
              onHover={onHover}
              onDragStart={onDragStart}
              onPortMouseDown={onPortMouseDown}
              onPortMouseEnter={onPortMouseEnter}
              onPortMouseLeave={onPortMouseLeave}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              connectingSource={connectingSource || undefined}
            />
          </div>
        );
      })}
    </>
  );
}
