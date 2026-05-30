import { useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ServiceWithPosition } from "@shared";
import { ServiceNodeInner } from "./ServiceNode";
import {
  NODE_WIDTH,
  NODE_HEIGHT,
  CHILD_ROW_GAP,
  computeGroupDimensions,
  type PortSide,
} from "./nodeGeometry";

interface NodeLayerProps {
  services: ServiceWithPosition[];
  dragOffsets: Record<string, { dx: number; dy: number }>;
  selectedId: string | null;
  hoveredNode: string | null;
  nestingTarget: string | null;
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
  nestingTarget,
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
  const rootServices = useMemo(() => services.filter((s) => !s.position?.parent_id), [services]);

  const childrenByParent = useMemo(() => {
    const map: Record<string, ServiceWithPosition[]> = {};

    for (const s of services) {
      const pid = s.position?.parent_id;

      if (pid) {
        if (!map[pid]) map[pid] = [];

        map[pid].push(s);
      }
    }

    for (const pid of Object.keys(map)) {
      map[pid].sort((a, b) => {
        const tA = a.created_at || "";
        const tB = b.created_at || "";

        if (tA !== tB) return tA < tB ? -1 : 1;

        return (a.id || "") < (b.id || "") ? -1 : 1;
      });
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

        let childrenSection: React.ReactNode = null;
        let expandedWidth: number | undefined;
        let childrenGridCols: number | undefined;

        if (children.length > 0) {
          const { w: groupW } = computeGroupDimensions(children.length);

          expandedWidth = groupW;
          childrenGridCols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(children.length))));

          const cols = childrenGridCols;
          const columnArrays: React.ReactNode[][] = Array.from({ length: cols }, () => []);

          children.forEach((child, idx) => {
            const col = idx % cols;
            const childDragX = dragOffsets[child.id!]?.dx || 0;
            const childDragY = dragOffsets[child.id!]?.dy || 0;
            const isChildSelected = selectedId === child.id;
            const isChildHovered = hoveredNode === child.id;

            columnArrays[col].push(
              <div
                key={child.id}
                style={{
                  position: "relative",
                  transform: `translate(${childDragX}px, ${childDragY}px)`,
                  zIndex: isChildSelected ? 5 : isChildHovered ? 4 : 2,
                }}
              >
                <ServiceNodeInner
                  service={child}
                  isSelected={isChildSelected}
                  isHovered={isChildHovered}
                  onDoubleClick={() => onDoubleClick(child)}
                  {...sharedNodeProps}
                />
              </div>,
            );
          });

          childrenSection = columnArrays.map((colChildren, colIdx) => (
            <div
              key={colIdx}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: `${CHILD_ROW_GAP}px`,
                width: `${NODE_WIDTH}px`,
              }}
            >
              {colChildren}
            </div>
          ));
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
            <ServiceNodeInner
              service={service}
              isSelected={isSelected}
              isHovered={isHovered}
              isNestTarget={isNestTarget}
              expandedWidth={expandedWidth}
              childrenSection={childrenSection}
              onDoubleClick={() => onDoubleClick(service)}
              {...sharedNodeProps}
            />
          </div>
        );
      })}
    </>
  );
}
