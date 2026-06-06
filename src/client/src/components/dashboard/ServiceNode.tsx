import type { MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import { CONTAINER_PADDING, PortSide } from "./nodeGeometry";
import { Icons } from "@/components/Icons";
import { PortTag } from "@/components/PortTag";

export type ResizeDirection = "se";

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

function getBorderColor(
  isNestTarget?: boolean,
  isSelected?: boolean,
  isHovered?: boolean,
  status?: string,
): string {
  if (isNestTarget) return "var(--success)";

  if (isSelected) return "var(--primary)";

  if (status === ServiceStatus.UP)
    return isHovered ? "var(--success)" : "color-mix(in srgb, var(--success) 50%, transparent)";

  if (status === ServiceStatus.DOWN)
    return isHovered
      ? "var(--destructive)"
      : "color-mix(in srgb, var(--destructive) 50%, transparent)";

  if (isHovered) return "var(--border-hover)";

  return "var(--border-color)";
}

function getBoxShadow(isNestTarget?: boolean, isSelected?: boolean, isHovered?: boolean): string {
  if (isNestTarget)
    return "0 0 0 3px color-mix(in srgb, var(--success) 15%, transparent), 0 4px 16px var(--black-alpha-30)";

  if (isSelected)
    return "0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent), 0 4px 12px var(--black-alpha-30)";

  if (isHovered) return "0 4px 16px var(--black-alpha-40)";

  return "0 2px 8px var(--black-alpha-20)";
}

interface PortDotProps {
  portClass: string;
  isSource?: boolean;
  isTarget?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function PortDot({
  portClass,
  isSource,
  isTarget,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
}: PortDotProps) {
  return (
    <div
      className={cn(
        "absolute w-3 h-3 rounded-full bg-primary border-2 border-card cursor-crosshair opacity-60 transition-all duration-200 z-10 hover:opacity-100 hover:shadow-port-glow",
        portClass,
      )}
      style={
        isSource
          ? {
              opacity: 1,
              background: "var(--accent-blue-lighter)",
              boxShadow: "0 0 10px var(--accent-blue-lighter-alpha-60)",
              animation: "pulse-port 1.5s infinite",
            }
          : isTarget
            ? {
                opacity: 1,
                background: "var(--accent-green-lighter)",
                boxShadow: "0 0 10px var(--accent-green-lighter-alpha-60)",
              }
            : undefined
      }
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
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

  const statusClass =
    service.status === ServiceStatus.UP
      ? "bg-success/15 text-success"
      : service.status === ServiceStatus.DOWN
        ? "bg-destructive/15 text-destructive"
        : "bg-muted-foreground/15 text-muted-foreground";

  return (
    <div
      data-service-id={service.id}
      className={cn(
        "draggable-node relative overflow-visible cursor-pointer transition-[border-color,box-shadow] duration-150 ease-in-out",
        isParent ? "flex flex-col" : "",
        isNestTarget ? "border-dashed" : "border-solid",
      )}
      style={{
        width: containerWidth ? `${containerWidth}px` : "220px",
        ...(isParent && containerHeight ? { height: `${containerHeight}px` } : {}),
        background:
          "color-mix(in srgb, transparent 40%, color-mix(in srgb, white 3%, var(--bg-card)))",
        border: `3px solid ${getBorderColor(isNestTarget, isSelected, isHovered, service.status)}`,
        borderRadius: "10px",
        boxShadow: getBoxShadow(isNestTarget, isSelected, isHovered),
      }}
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
      {/* The header area is the drag handle — cursor communicates this. */}
      <div
        className="cursor-grab active:cursor-grabbing shrink-0 relative"
        data-info-section
        onMouseDown={(e: ReactMouseEvent) => onDragStart(e, service.id!)}
      >
        {showPorts && (
          <>
            <PortDot
              portClass="port-top"
              isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.TOP
              }
              isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.BOTTOM
              }
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.TOP);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
            <PortDot
              portClass="port-bottom"
              isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.BOTTOM
              }
              isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.TOP
              }
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.BOTTOM);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
            <PortDot
              portClass="port-left"
              isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.LEFT
              }
              isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.RIGHT
              }
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.LEFT);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
            <PortDot
              portClass="port-right"
              isSource={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.RIGHT
              }
              isTarget={
                connectingSource?.serviceId === service.id &&
                connectingSource?.side === PortSide.LEFT
              }
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortMouseDown(e, service.id!, PortSide.RIGHT);
              }}
              onMouseEnter={() => onPortMouseEnter?.(service.id!)}
              onMouseLeave={() => onPortMouseLeave?.()}
            />
          </>
        )}

        <div className="bg-card rounded-[10px] px-3 py-2.5">
          <div className="text-[0.85rem] font-semibold text-foreground flex items-center gap-1.5 overflow-hidden">
            {service.source === ServiceSource.DOCKER ? (
              <Icons.Docker size={14} className="text-muted-foreground" />
            ) : (
              <Icons.Globe size={14} className="text-muted-foreground" />
            )}
            <span className="whitespace-nowrap overflow-hidden text-ellipsis" title={service.name}>
              {service.name}
            </span>
          </div>

          {service.source === ServiceSource.DOCKER && service.metadata?.imageTag && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="inline-block px-[5px] py-px bg-accent-purple/10 text-accent-purple rounded text-[0.6rem] font-mono shrink-0">
                {service.metadata.imageTag as string}
              </span>
              {service.metadata.hasUpdate && (
                <>
                  <Icons.ArrowRight size={10} className="text-muted-foreground" />
                  <span className="inline-block px-[5px] py-px bg-warning/10 text-warning border border-warning/30 rounded text-[0.6rem] font-mono shrink-0">
                    {(service.metadata.latestVersion as string | undefined) ?? "update available"}
                  </span>
                </>
              )}
            </div>
          )}

          <div className="text-[0.7rem] text-muted-foreground mt-0.5 font-mono flex items-center flex-wrap gap-1">
            {service.host}
            {service.ports?.map((p) => (
              <PortTag key={p}>:{p}</PortTag>
            ))}
          </div>

          <div
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] text-[0.65rem] font-semibold mt-2 uppercase tracking-[0.5px]",
              statusClass,
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
            {service.status}
          </div>

          <div className="mt-2 flex gap-1 flex-wrap">
            <span className="px-[6px] py-px rounded text-[0.65rem] bg-warning/10 text-warning">
              {service.source}
            </span>
          </div>
        </div>
      </div>

      {/* Free-form container for children — position:relative so children use absolute coords. */}
      {isParent && (
        <div
          className="flex-1 relative overflow-visible border-t border-[color-mix(in_srgb,var(--primary)_20%,var(--border-color))]"
          style={{ minHeight: CONTAINER_PADDING }}
        >
          {childrenSection}
        </div>
      )}

      {/* Container-bottom port — only for parent nodes */}
      {isParent && showPorts && (
        <PortDot
          portClass="port-container-bottom"
          isSource={
            connectingSource?.serviceId === service.id &&
            connectingSource?.side === PortSide.CONTAINER_BOTTOM
          }
          isTarget={
            connectingSource?.serviceId === service.id && connectingSource?.side === PortSide.TOP
          }
          onMouseDown={(e) => {
            e.stopPropagation();
            onPortMouseDown!(e, service.id!, PortSide.CONTAINER_BOTTOM);
          }}
          onMouseEnter={() => onPortMouseEnter?.(service.id!)}
          onMouseLeave={() => onPortMouseLeave?.()}
        />
      )}

      {/* SE resize handle — only for parent container nodes */}
      {showResizeHandle && (
        <div
          className="absolute bottom-[-5px] right-[-5px] w-3.5 h-3.5 cursor-se-resize rounded-sm bg-primary opacity-70 transition-opacity duration-150 z-20 hover:opacity-100"
          onMouseDown={(e: React.MouseEvent) => {
            e.stopPropagation();
            onResizeStart!(e, service.id!, "se");
          }}
        />
      )}
    </div>
  );
}
