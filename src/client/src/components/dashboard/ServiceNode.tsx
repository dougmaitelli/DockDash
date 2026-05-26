import type { MouseEvent as ReactMouseEvent } from "react";
import styled from "styled-components";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import { colors } from "../../styles/vars";
import { NODE_WIDTH, CHILD_GAP, GROUP_CARD_INNER_PADDING, PortSide } from "./nodeGeometry";

interface NodeCardProps {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
  isNestTarget?: boolean;
  $expandedWidth?: number;
}

const NodeCard = styled.div.withConfig({
  shouldForwardProp: (prop) =>
    !["isSelected", "isHovered", "isNestTarget", "$expandedWidth", "service"].includes(prop),
})<NodeCardProps>`
  position: relative;
  width: ${(props) => (props.$expandedWidth ? `${props.$expandedWidth}px` : "220px")};
  background: ${colors.bgCard};
  border: 3px solid
    ${(props) =>
      props.isNestTarget
        ? colors.accentGreen
        : props.isSelected
          ? colors.accentBlue
          : props.isHovered
            ? colors.borderHover
            : props.service.status === ServiceStatus.UP
              ? `color-mix(in srgb, ${colors.accentGreen} 50%, transparent)`
              : props.service.status === ServiceStatus.DOWN
                ? `color-mix(in srgb, ${colors.accentRed} 50%, transparent)`
                : colors.border};
  border-style: ${(props) => (props.isNestTarget ? "dashed" : "solid")};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: ${(props) =>
    props.isNestTarget
      ? `0 0 0 3px ${colors.accentGreenAlpha15}, 0 4px 16px ${colors.blackAlpha30}`
      : props.isSelected
        ? `0 0 0 2px ${colors.accentBlueAlpha20}, 0 4px 12px ${colors.blackAlpha30}`
        : props.isHovered
          ? `0 4px 16px ${colors.blackAlpha40}`
          : `0 2px 8px ${colors.blackAlpha20}`};
`;

const InfoSection = styled.div`
  position: relative;
`;

const NodeBody = styled.div`
  padding: 10px 12px;
`;

const ChildrenSection = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$cols}, ${NODE_WIDTH}px);
  gap: ${CHILD_GAP}px;
  padding: ${GROUP_CARD_INNER_PADDING}px;
  border-top: 1px solid color-mix(in srgb, ${colors.accentBlue} 20%, ${colors.border});
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

  span.icon {
    font-size: 0.9rem;
    flex-shrink: 0;
  }
`;

const ServiceHost = styled.div`
  font-size: 0.7rem;
  color: ${colors.textMuted};
  margin-top: 2px;
  font-family: "SF Mono", "Fira Code", monospace;
`;

const StatusBadge = styled.div<{ status: string }>`
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
  background: ${(props) =>
    props.status === ServiceStatus.UP
      ? colors.accentGreenAlpha15
      : props.status === ServiceStatus.DOWN
        ? colors.accentRedAlpha15
        : colors.textMutedAlpha15};
  color: ${(props) =>
    props.status === ServiceStatus.UP
      ? colors.accentGreen
      : props.status === ServiceStatus.DOWN
        ? colors.accentRed
        : colors.textMuted};
`;

const PortTag = styled.span`
  display: inline-block;
  padding: 1px 6px;
  background: ${colors.accentBlueAlpha10};
  color: ${colors.accentBlue};
  border-radius: 4px;
  font-size: 0.65rem;
  margin-left: 4px;
  font-family: "SF Mono", "Fira Code", monospace;
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

  ${(props) =>
    props.$isSource &&
    `
    opacity: 1;
    background: ${colors.accentBlueLighter};
    box-shadow: 0 0 10px ${colors.accentBlueLighterAlpha60};
    animation: pulse-port 1.5s infinite;
  `}

  ${(props) =>
    props.$isTarget &&
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

interface ServiceNodeInnerProps {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
  isNestTarget?: boolean;
  expandedWidth?: number;
  childrenGridCols?: number;
  childrenSection?: React.ReactNode;
  onSelect: (id: string) => void;
  onDoubleClick: () => void;
  onHover: (id: string | null) => void;
  onDragStart: (e: React.MouseEvent, serviceId: string) => void;
  onPortMouseDown?: (e: React.MouseEvent, serviceId: string, side: PortSide) => void;
  onPortMouseEnter?: (serviceId: string) => void;
  onPortMouseLeave?: () => void;
  onNodeMouseEnter?: (serviceId: string) => void;
  onNodeMouseLeave?: () => void;
  connectingSource?: { serviceId: string; side: PortSide };
}

export function ServiceNodeInner({
  service,
  isSelected,
  isHovered,
  isNestTarget,
  expandedWidth,
  childrenGridCols = 1,
  childrenSection,
  onSelect,
  onDoubleClick,
  onHover,
  onDragStart,
  onPortMouseDown,
  onPortMouseEnter,
  onPortMouseLeave,
  onNodeMouseEnter,
  onNodeMouseLeave,
  connectingSource,
}: ServiceNodeInnerProps) {
  return (
    <NodeCard
      service={service}
      isSelected={isSelected}
      isHovered={isHovered}
      isNestTarget={isNestTarget}
      $expandedWidth={expandedWidth}
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
      onMouseDown={(e: ReactMouseEvent) => onDragStart(e, service.id!)}
      onMouseEnter={(_e: ReactMouseEvent) => {
        onHover(service.id!);
        onNodeMouseEnter?.(service.id!);
      }}
      onMouseLeave={(_e: ReactMouseEvent) => {
        onHover(null);
        onNodeMouseLeave?.();
      }}
    >
      {onPortMouseDown && isHovered && (
        <>
          <PortDot
            className="port-left"
            $isSource={
              connectingSource?.serviceId === service.id && connectingSource?.side === "left"
            }
            $isTarget={
              connectingSource?.serviceId === service.id && connectingSource?.side === "right"
            }
            onMouseDown={(e: React.MouseEvent) => {
              e.stopPropagation();
              onPortMouseDown(e, service.id!, "left");
            }}
            onMouseEnter={() => onPortMouseEnter?.(service.id!)}
            onMouseLeave={() => onPortMouseLeave?.()}
          />
          <PortDot
            className="port-right"
            $isSource={
              connectingSource?.serviceId === service.id && connectingSource?.side === "right"
            }
            $isTarget={
              connectingSource?.serviceId === service.id && connectingSource?.side === "left"
            }
            onMouseDown={(e: React.MouseEvent) => {
              e.stopPropagation();
              onPortMouseDown(e, service.id!, "right");
            }}
            onMouseEnter={() => onPortMouseEnter?.(service.id!)}
            onMouseLeave={() => onPortMouseLeave?.()}
          />
          <PortDot
            className="port-top"
            $isSource={
              connectingSource?.serviceId === service.id && connectingSource?.side === "top"
            }
            $isTarget={
              connectingSource?.serviceId === service.id && connectingSource?.side === "bottom"
            }
            onMouseDown={(e: React.MouseEvent) => {
              e.stopPropagation();
              onPortMouseDown(e, service.id!, "top");
            }}
            onMouseEnter={() => onPortMouseEnter?.(service.id!)}
            onMouseLeave={() => onPortMouseLeave?.()}
          />
          <PortDot
            className="port-bottom"
            $isSource={
              connectingSource?.serviceId === service.id && connectingSource?.side === "bottom"
            }
            $isTarget={
              connectingSource?.serviceId === service.id && connectingSource?.side === "top"
            }
            onMouseDown={(e: React.MouseEvent) => {
              e.stopPropagation();
              onPortMouseDown(e, service.id!, "bottom");
            }}
            onMouseEnter={() => onPortMouseEnter?.(service.id!)}
            onMouseLeave={() => onPortMouseLeave?.()}
          />
        </>
      )}
      <InfoSection>
        <NodeBody>
          <ServiceName>
            <span className="icon">{service.source === ServiceSource.DOCKER ? "🐳" : "🌐"}</span>
            <span className="name" title={service.name}>
              {service.name}
            </span>
          </ServiceName>
          <ServiceHost>
            {service.host}
            {service.port && <PortTag>:{service.port}</PortTag>}
          </ServiceHost>
          <StatusBadge status={service.status}>
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
                background: colors.accentPurpleAlpha10,
                color: colors.accentPurple,
              }}
            >
              {service.protocol}
            </span>
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
      </InfoSection>
      {childrenSection && (
        <ChildrenSection $cols={childrenGridCols}>{childrenSection}</ChildrenSection>
      )}
    </NodeCard>
  );
}
