import type { MouseEvent as ReactMouseEvent } from "react";
import styled from "styled-components";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import { colors } from "../../styles/vars";
import { CONTAINER_PADDING, PortSide } from "./nodeGeometry";
import { IconArrowRight, IconDocker, IconGlobe } from "../../utils/Icons";
import { PortTag } from "../../utils/ui";

export type ResizeDirection = "se";

interface NodeCardProps {
  $isNestTarget?: boolean;
  $isSelected?: boolean;
  $isHovered?: boolean;
  $status?: string;
  $isParent?: boolean;
  $containerWidth?: number;
  $containerHeight?: number;
}

const NodeCard = styled.div<NodeCardProps>`
  position: relative;
  width: ${(p) => (p.$containerWidth ? `${p.$containerWidth}px` : "220px")};
  ${(p) => (p.$isParent && p.$containerHeight ? `height: ${p.$containerHeight}px;` : "")}
  ${(p) => (p.$isParent ? "display: flex; flex-direction: column;" : "")}
  background: color-mix(in srgb, transparent 40%, color-mix(in srgb, white 3%, ${colors.bgCard}));
  border: 3px solid
    ${(p) =>
      p.$isNestTarget
        ? colors.accentGreen
        : p.$isSelected
          ? colors.accentBlue
          : p.$isHovered
            ? colors.borderHover
            : p.$status === ServiceStatus.UP
              ? `color-mix(in srgb, ${colors.accentGreen} 50%, transparent)`
              : p.$status === ServiceStatus.DOWN
                ? `color-mix(in srgb, ${colors.accentRed} 50%, transparent)`
                : colors.border};
  border-style: ${(p) => (p.$isNestTarget ? "dashed" : "solid")};
  border-radius: 10px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  box-shadow: ${(p) =>
    p.$isNestTarget
      ? `0 0 0 3px ${colors.accentGreenAlpha15}, 0 4px 16px ${colors.blackAlpha30}`
      : p.$isSelected
        ? `0 0 0 2px ${colors.accentBlueAlpha20}, 0 4px 12px ${colors.blackAlpha30}`
        : p.$isHovered
          ? `0 4px 16px ${colors.blackAlpha40}`
          : `0 2px 8px ${colors.blackAlpha20}`};
  overflow: visible;
`;

// The header area is the drag handle — cursor communicates this.
const DragHandle = styled.div`
  cursor: grab;
  flex-shrink: 0;
  position: relative;

  &:active {
    cursor: grabbing;
  }
`;

const NodeBody = styled.div`
  background: ${colors.bgCard};
  border-radius: 10px;
  padding: 10px 12px;
`;

// Free-form container for children — position:relative so children use absolute coords.
const ContainerBody = styled.div`
  flex: 1;
  position: relative;
  overflow: visible;
  border-top: 1px solid color-mix(in srgb, ${colors.accentBlue} 20%, ${colors.border});
`;

const ResizeHandle = styled.div`
  position: absolute;
  bottom: -5px;
  right: -5px;
  width: 14px;
  height: 14px;
  cursor: se-resize;
  border-radius: 3px;
  background: ${colors.accentBlue};
  opacity: 0.7;
  transition: opacity 0.15s;
  z-index: 20;

  &:hover {
    opacity: 1;
  }
`;

const ServiceName = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${colors.textPrimary};
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;

  span.name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const ServiceHost = styled.div`
  font-size: 0.7rem;
  color: ${colors.textMuted};
  margin-top: 2px;
  font-family: "SF Mono", "Fira Code", monospace;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
`;

const StatusBadge = styled.div<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.65rem;
  font-weight: 600;
  margin-top: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${(p) =>
    p.$status === ServiceStatus.UP
      ? colors.accentGreenAlpha15
      : p.$status === ServiceStatus.DOWN
        ? colors.accentRedAlpha15
        : colors.textMutedAlpha15};
  color: ${(p) =>
    p.$status === ServiceStatus.UP
      ? colors.accentGreen
      : p.$status === ServiceStatus.DOWN
        ? colors.accentRed
        : colors.textMuted};
`;

const ImageTag = styled.span`
  display: inline-block;
  padding: 1px 5px;
  background: ${colors.accentPurpleAlpha10};
  color: ${colors.accentPurple};
  border-radius: 4px;
  font-size: 0.6rem;
  font-family: "SF Mono", "Fira Code", monospace;
  flex-shrink: 0;
`;

const TagRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
`;

const UpdateTag = styled.span`
  display: inline-block;
  padding: 1px 5px;
  background: ${colors.accentYellowAlpha10};
  color: ${colors.accentYellow};
  border: 1px solid color-mix(in srgb, ${colors.accentYellow} 30%, transparent);
  border-radius: 4px;
  font-size: 0.6rem;
  font-family: "SF Mono", "Fira Code", monospace;
  flex-shrink: 0;
`;

const PortDot = styled.div<{ $isSource?: boolean; $isTarget?: boolean }>`
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${colors.accentBlue};
  border: 2px solid ${colors.bgCard};
  cursor: crosshair;
  opacity: 0.6;
  transition: all 0.2s ease;
  z-index: 10;

  &:hover {
    opacity: 1;
    box-shadow: 0 0 8px ${colors.accentBlueAlpha50};
  }

  &.port-left {
    left: -7px;
    top: 50%;
    transform: translateY(-50%);
    &:hover {
      transform: translateY(-50%) scale(1.4);
    }
  }

  &.port-right {
    right: -7px;
    top: 50%;
    transform: translateY(-50%);
    &:hover {
      transform: translateY(-50%) scale(1.4);
    }
  }

  &.port-top {
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    &:hover {
      transform: translateX(-50%) scale(1.4);
    }
  }

  &.port-bottom {
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    &:hover {
      transform: translateX(-50%) scale(1.4);
    }
  }

  /* Positioned relative to NodeCard (the full container), not DragHandle */
  &.port-container-bottom {
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    &:hover {
      transform: translateX(-50%) scale(1.4);
    }
  }

  ${(p) =>
    p.$isSource &&
    `
    opacity: 1;
    background: ${colors.accentBlueLighter};
    box-shadow: 0 0 10px ${colors.accentBlueLighterAlpha60};
    animation: pulse-port 1.5s infinite;
  `}

  ${(p) =>
    p.$isTarget &&
    `
    opacity: 1;
    background: ${colors.accentGreenLighter};
    box-shadow: 0 0 10px ${colors.accentGreenLighterAlpha60};
  `}

  @keyframes pulse-port {
    0%,
    100% {
      transform: translateY(-50%) scale(1);
    }
    50% {
      transform: translateY(-50%) scale(1.2);
    }
  }
`;

interface ServiceNodeProps {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
  isNestTarget?: boolean;
  containerWidth?: number;
  containerHeight?: number;
  childrenSection?: React.ReactNode;
  onSelect: (id: string) => void;
  onDoubleClick: () => void;
  onHover: (id: string | null) => void;
  onDragStart: (e: React.MouseEvent, serviceId: string) => void;
  onResizeStart?: (e: React.MouseEvent, serviceId: string, direction: ResizeDirection) => void;
  onPortMouseDown?: (e: React.MouseEvent, serviceId: string, side: PortSide) => void;
  onPortMouseEnter?: (serviceId: string) => void;
  onPortMouseLeave?: () => void;
  onNodeMouseEnter?: (serviceId: string) => void;
  onNodeMouseLeave?: () => void;
  connectingSource?: { serviceId: string; side: PortSide };
}

export function ServiceNode({
  service,
  isSelected,
  isHovered,
  isNestTarget,
  containerWidth,
  containerHeight,
  childrenSection,
  onSelect,
  onDoubleClick,
  onHover,
  onDragStart,
  onResizeStart,
  onPortMouseDown,
  onPortMouseEnter,
  onPortMouseLeave,
  onNodeMouseEnter,
  onNodeMouseLeave,
  connectingSource,
}: ServiceNodeProps) {
  const isParent = !!childrenSection;
  const showPorts = onPortMouseDown && isHovered;
  const showResizeHandle = isParent && onResizeStart && (isHovered || isSelected);

  return (
    <NodeCard
      $isNestTarget={isNestTarget}
      $isSelected={isSelected}
      $isHovered={isHovered}
      $status={service.status}
      $isParent={isParent}
      $containerWidth={containerWidth}
      $containerHeight={containerHeight}
      className="draggable-node"
      data-service-id={service.id}
      onClick={(e: ReactMouseEvent) => {
        e.stopPropagation();
        onSelect(service.id!);
      }}
      onDoubleClick={(e: ReactMouseEvent) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      onMouseEnter={(_e: ReactMouseEvent) => {
        onHover(service.id!);
        onNodeMouseEnter?.(service.id!);
      }}
      onMouseLeave={(e: ReactMouseEvent) => {
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        const targetNode = relatedTarget?.closest?.("[data-service-id]") as HTMLElement | null;

        if (targetNode && targetNode !== (e.currentTarget as HTMLElement)) {
          const targetId = targetNode.dataset.serviceId;

          if (targetId) {
            onHover(targetId);
            onNodeMouseEnter?.(targetId);

            return;
          }
        }

        onHover(null);
        onNodeMouseLeave?.();
      }}
    >
      {/* Drag handle wraps the info section — only this area initiates a drag */}
      <DragHandle
        data-info-section
        onMouseDown={(e: ReactMouseEvent) => onDragStart(e, service.id!)}
      >
        {showPorts && (
          <>
            <PortDot
              className="port-top"
              $isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.TOP
              }
              $isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.BOTTOM
              }
              onMouseDown={(e: React.MouseEvent) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.TOP);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
            <PortDot
              className="port-bottom"
              $isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.BOTTOM
              }
              $isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.TOP
              }
              onMouseDown={(e: React.MouseEvent) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.BOTTOM);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
            <PortDot
              className="port-left"
              $isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.LEFT
              }
              $isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.RIGHT
              }
              onMouseDown={(e: React.MouseEvent) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.LEFT);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
            <PortDot
              className="port-right"
              $isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.RIGHT
              }
              $isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.LEFT
              }
              onMouseDown={(e: React.MouseEvent) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.RIGHT);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
          </>
        )}
        <NodeBody>
          <ServiceName>
            {service.source === ServiceSource.DOCKER ? (
              <IconDocker size={14} style={{ flexShrink: 0, color: colors.textMuted }} />
            ) : (
              <IconGlobe size={14} style={{ flexShrink: 0, color: colors.textMuted }} />
            )}
            <span className="name" title={service.name}>
              {service.name}
            </span>
          </ServiceName>
          {service.source === ServiceSource.DOCKER && service.metadata?.imageTag && (
            <TagRow>
              <ImageTag>{service.metadata.imageTag as string}</ImageTag>
              {service.metadata.hasUpdate && (
                <>
                  <IconArrowRight size={10} style={{ color: colors.textMuted, flexShrink: 0 }} />
                  <UpdateTag>
                    {(service.metadata.latestVersion as string | undefined) ?? "update available"}
                  </UpdateTag>
                </>
              )}
            </TagRow>
          )}
          <ServiceHost>
            {service.host}
            {service.ports?.map((p) => (
              <PortTag key={p}>:{p}</PortTag>
            ))}
          </ServiceHost>
          <StatusBadge $status={service.status}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background:
                  service.status === ServiceStatus.UP
                    ? colors.accentGreen
                    : service.status === ServiceStatus.DOWN
                      ? colors.accentRed
                      : colors.textMuted,
              }}
            />
            {service.status}
          </StatusBadge>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: "0.65rem",
                background: colors.accentYellowAlpha10,
                color: colors.accentYellow,
              }}
            >
              {service.source}
            </span>
          </div>
        </NodeBody>
      </DragHandle>

      {/* Free-form container body for child nodes */}
      {isParent && (
        <ContainerBody style={{ minHeight: CONTAINER_PADDING }}>{childrenSection}</ContainerBody>
      )}

      {/* Container-bottom port — on the full NodeCard, only for parent nodes */}
      {isParent && showPorts && (
        <PortDot
          className="port-container-bottom"
          $isSource={
            connectingSource?.serviceId === service.id &&
            connectingSource?.side === PortSide.CONTAINER_BOTTOM
          }
          $isTarget={
            connectingSource?.serviceId === service.id && connectingSource?.side === PortSide.TOP
          }
          onMouseDown={(e: React.MouseEvent) => {
            e.stopPropagation();
            onPortMouseDown!(e, service.id!, PortSide.CONTAINER_BOTTOM);
          }}
          onMouseEnter={() => onPortMouseEnter?.(service.id!)}
          onMouseLeave={() => onPortMouseLeave?.()}
        />
      )}

      {/* SE resize handle — only shown for parent container nodes */}
      {showResizeHandle && (
        <ResizeHandle
          onMouseDown={(e: React.MouseEvent) => {
            e.stopPropagation();
            onResizeStart!(e, service.id!, "se");
          }}
        />
      )}
    </NodeCard>
  );
}
