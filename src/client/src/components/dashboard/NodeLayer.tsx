import { useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ServiceWithPosition } from "@shared";
import { ServiceNode, type ResizeDirection } from "./ServiceNode";
import {
  NODE_WIDTH,
  NODE_HEIGHT,
  DEFAULT_CONTAINER_WIDTH,
  DEFAULT_CONTAINER_HEIGHT,
  PortSide,
} from "./nodeGeometry";

interface NodeLayerProps {
  services: ServiceWithPosition[];
  dragOffsets: Record<string, { dx: number; dy: number }>;
  resizeDimensions: Record<string, { w: number; h: number }>;
  selectedId: string | null;
  hoveredNode: string | null;
  nestingTarget: string | null;
  connectingSource: { serviceId: string; side: PortSide } | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDoubleClick: (service: ServiceWithPosition) => void;
  onDragStart: (e: ReactMouseEvent, serviceId: string) => void;
  onResizeStart: (e: ReactMouseEvent, serviceId: string, direction: ResizeDirection) => void;
  onPortMouseDown: (e: ReactMouseEvent, serviceId: string, side: PortSide) => void;
  onPortMouseEnter: (serviceId: string) => void;
  onPortMouseLeave: () => void;
  onNodeMouseEnter: (serviceId: string) => void;
  onNodeMouseLeave: () => void;
}

export function NodeLayer({
  services,
  dragOffsets,
  resizeDimensions,
  selectedId,
  hoveredNode,
  nestingTarget,
  connectingSource,
  onSelect,
  onHover,
  onDoubleClick,
  onDragStart,
  onResizeStart,
  onPortMouseDown,
  onPortMouseEnter,
  onPortMouseLeave,
  onNodeMouseEnter,
  onNodeMouseLeave,
}: NodeLayerProps) {
  const rootServices = useMemo(() => services.filter((s) => !s.position?.parentId), [services]);

  const childrenByParent = useMemo(() => {
    const map: Record<string, ServiceWithPosition[]> = {};

    for (const s of services) {
      const pid = s.position?.parentId;

      if (pid) {
        if (!map[pid]) map[pid] = [];

        map[pid].push(s);
      }
    }

    return map;
  }, [services]);

  const sharedNodeProps = {
    connectingSource: connectingSource || undefined,
    onSelect,
    onHover,
    onDragStart,
    onPortMouseDown,
    onPortMouseEnter,
    onPortMouseLeave,
    onNodeMouseEnter,
    onNodeMouseLeave,
  };

  return (
    <>
      {rootServices.map((service) => {
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
          const fullIdx = services.findIndex((s) => s.id === service.id);
          const cols = Math.max(3, Math.ceil(Math.sqrt(services.length)));
          const row = Math.floor(fullIdx / cols);
          const col = fullIdx % cols;

          x = 100 + col * (NODE_WIDTH + 60) + dragX;
          y = 120 + row * (NODE_HEIGHT + 80) + dragY;
        }

        const children = childrenByParent[service.id!] || [];
        const isNestTarget = nestingTarget === service.id;
        const isSelected = selectedId === service.id;
        const isHovered = hoveredNode === service.id;
        const anyChildActive = children.some((c) => selectedId === c.id || hoveredNode === c.id);
        const zIndex = isSelected || isHovered || anyChildActive ? 10 : 1;

        // Live resize dimensions take precedence over stored ones.
        const rz = resizeDimensions[service.id!];
        const containerWidth =
          children.length > 0
            ? (rz?.w ?? service.position?.w ?? DEFAULT_CONTAINER_WIDTH)
            : undefined;
        const containerHeight =
          children.length > 0
            ? (rz?.h ?? service.position?.h ?? DEFAULT_CONTAINER_HEIGHT)
            : undefined;

        // Build free-form children — each absolutely positioned inside ContainerBody.
        let childrenSection: React.ReactNode = null;

        if (children.length > 0) {
          childrenSection = children.map((child) => {
            const cx = child.position?.x ?? 0;
            const cy = child.position?.y ?? 0;
            const cdx = dragOffsets[child.id!]?.dx ?? 0;
            const cdy = dragOffsets[child.id!]?.dy ?? 0;
            const isChildSelected = selectedId === child.id;
            const isChildHovered = hoveredNode === child.id;

            return (
              <div
                key={child.id}
                style={{
                  position: "absolute",
                  left: cx + cdx,
                  top: cy + cdy,
                  zIndex: isChildSelected ? 5 : isChildHovered ? 4 : 2,
                }}
              >
                <ServiceNode
                  service={child}
                  isSelected={isChildSelected}
                  isHovered={isChildHovered}
                  onDoubleClick={() => onDoubleClick(child)}
                  {...sharedNodeProps}
                />
              </div>
            );
          });
        }

        return (
          <div
            key={service.id}
            style={{
              position: "absolute",
              left: `${x}px`,
              top: `${y}px`,
              zIndex,
              pointerEvents: "auto",
            }}
          >
            <ServiceNode
              service={service}
              isSelected={isSelected}
              isHovered={isHovered}
              isNestTarget={isNestTarget}
              containerWidth={containerWidth}
              containerHeight={containerHeight}
              childrenSection={childrenSection}
              onDoubleClick={() => onDoubleClick(service)}
              onResizeStart={onResizeStart}
              {...sharedNodeProps}
            />
          </div>
        );
      })}
    </>
  );
}
