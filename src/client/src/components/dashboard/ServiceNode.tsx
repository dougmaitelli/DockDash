import type { MouseEvent as ReactMouseEvent } from "react";
import styled from "styled-components";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import { colors } from "../../styles/theme";

interface ServiceNodeProps {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
}

const NodeCard = styled.div.withConfig({
  shouldForwardProp: (prop) => !["isSelected", "isHovered"].includes(prop),
})<ServiceNodeProps>`
  width: 220px;
  background: #1e2230;
  border: 3px solid
    ${(props) =>
      props.isSelected
        ? "#3b82f6"
        : props.service.status === ServiceStatus.UP
          ? `color-mix(in srgb, ${colors.accentGreen} 50%, transparent)`
          : props.service.status === ServiceStatus.DOWN
            ? `color-mix(in srgb, ${colors.accentRed} 50%, transparent)`
            : "#2d3348"};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: ${(props) =>
    props.isSelected
      ? "0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3)"
      : "0 2px 8px rgba(0, 0, 0, 0.2)"};

  &:hover {
    border-color: ${(props) =>
      props.isSelected ? "#3b82f6" : props.isHovered ? "#3d4460" : "#3d4460"};
    box-shadow: ${(props) =>
      props.isSelected
        ? "0 0 0 2px rgba(59, 130, 246, 0.3), 0 6px 20px rgba(0, 0, 0, 0.4)"
        : "0 4px 16px rgba(0, 0, 0, 0.4)"};
  }
`;

const NodeBody = styled.div`
  padding: 10px 12px;
`;

const ServiceName = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  color: #e8eaf0;
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
  color: #6b7290;
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
      ? "rgba(16, 185, 129, 0.15)"
      : props.status === ServiceStatus.DOWN
        ? "rgba(239, 68, 68, 0.15)"
        : "rgba(107, 114, 144, 0.15)"};
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
  background: rgba(59, 130, 246, 0.1);
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
  background: #3b82f6;
  border: 2px solid #1e2230;
  cursor: crosshair;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 10;

  .draggable-node:hover &,
  .connection-port {
    opacity: 0.6;
  }

  .draggable-node:hover &:hover,
  .connection-port:hover {
    opacity: 1;
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
  }

  &.port-left {
    left: -7px;
    top: 50%;
    transform: translateY(-50%);
    &:hover { transform: translateY(-50%) scale(1.4); }
  }

  &.port-right {
    right: -7px;
    top: 50%;
    transform: translateY(-50%);
    &:hover { transform: translateY(-50%) scale(1.4); }
  }

  &.port-top {
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    &:hover { transform: translateX(-50%) scale(1.4); }
  }

  &.port-bottom {
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    &:hover { transform: translateX(-50%) scale(1.4); }
  }

  ${(props) =>
    props.$isSource &&
    `
    opacity: 1;
    background: #60a5fa;
    box-shadow: 0 0 10px rgba(96, 165, 250, 0.6);
    animation: pulse-port 1.5s infinite;
  `}

  ${(props) =>
    props.$isTarget &&
    `
    opacity: 1;
    background: #34d399;
    box-shadow: 0 0 10px rgba(52, 211, 153, 0.6);
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
  onSelect: (id: string) => void;
  onDoubleClick: () => void;
  onHover: (id: string | null) => void;
  onDragStart: (e: React.MouseEvent, serviceId: string) => void;
  onPortMouseDown?: (
    e: React.MouseEvent,
    serviceId: string,
    side: "left" | "right" | "top" | "bottom",
  ) => void;
  onPortMouseEnter?: (serviceId: string) => void;
  onPortMouseLeave?: () => void;
  onNodeMouseEnter?: (serviceId: string) => void;
  onNodeMouseLeave?: () => void;
  connectingSource?: { serviceId: string; side: "left" | "right" | "top" | "bottom" };
}

export function ServiceNodeInner({
  service,
  isSelected,
  isHovered,
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
      className="draggable-node"
      data-service-id={service.id}
      onClick={() => onSelect(service.id!)}
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
      {/* Connection port dots */}
      {onPortMouseDown && (
        <>
          <PortDot
            className="connection-port port-left"
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
            className="connection-port port-right"
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
            className="connection-port port-top"
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
            className="connection-port port-bottom"
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
              background: "rgba(139, 92, 246, 0.1)",
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
              background: "rgba(245, 158, 11, 0.1)",
              color: colors.accentYellow,
            }}
          >
            {service.source}
          </span>
        </div>
      </NodeBody>
    </NodeCard>
  );
}
