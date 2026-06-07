import type { ServiceWithPosition } from "@shared";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 120;
export const CARD_BORDER_WIDTH = 3;

// Default dimensions for a container node (parent with children).
export const DEFAULT_CONTAINER_WIDTH = 400;
export const DEFAULT_CONTAINER_HEIGHT = 280;
// Padding inside the container body where children are placed.
export const CONTAINER_PADDING = 12;

export enum PortSide {
  LEFT = "left",
  RIGHT = "right",
  TOP = "top",
  BOTTOM = "bottom",
  CONTAINER_BOTTOM = "container-bottom",
}

// --- DOM helpers -----------------------------------------------------------

export function getNodeEl(serviceId: string): HTMLElement | null {
  return document.querySelector(`[data-service-id="${serviceId}"]`);
}

export function getInfoSectionHeight(serviceId: string): number {
  const el = getNodeEl(serviceId)?.querySelector("[data-info-section]") as HTMLElement | null;

  return el?.offsetHeight ?? NODE_HEIGHT;
}

// ---------------------------------------------------------------------------

export function getAbsoluteNodePosition(
  service: ServiceWithPosition,
  allServices: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): { x: number; y: number } {
  const pos = service.position;
  const offset = dragOffsets[service.id!] || { dx: 0, dy: 0 };

  if (!pos?.parentId) {
    if (pos) {
      return { x: pos.x + offset.dx, y: pos.y + offset.dy };
    }

    const idx = allServices.findIndex((s) => s.id === service.id);

    if (idx === -1) return { x: offset.dx, y: offset.dy };

    const cols = Math.max(3, Math.ceil(Math.sqrt(allServices.length)));
    const row = Math.floor(idx / cols);
    const col = idx % cols;

    return { x: 100 + col * 280 + offset.dx, y: 120 + row * 200 + offset.dy };
  }

  // Child node: position.x/y is relative to the parent's container body.
  const parent = allServices.find((s) => s.id === pos.parentId);

  if (!parent) {
    return { x: pos.x + offset.dx, y: pos.y + offset.dy };
  }

  const parentAbs = getAbsoluteNodePosition(parent, allServices, dragOffsets);
  const headerH = getInfoSectionHeight(pos.parentId);

  return {
    x: parentAbs.x + CARD_BORDER_WIDTH + pos.x + offset.dx,
    y: parentAbs.y + CARD_BORDER_WIDTH + headerH + pos.y + offset.dy,
  };
}

export function getNodeSize(serviceId: string): { w: number; h: number } | null {
  const el = getNodeEl(serviceId);

  if (!el) return null;

  return { w: el.offsetWidth, h: el.offsetHeight };
}

export function getNodeCenter(
  serviceId: string,
  services: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): { x: number; y: number } | null {
  const service = services.find((s) => s.id === serviceId);

  if (!service) return null;

  const absPos = getAbsoluteNodePosition(service, services, dragOffsets);
  const size = getNodeSize(serviceId);

  return {
    x: absPos.x + (size?.w || NODE_WIDTH) / 2,
    y: absPos.y + (size?.h || NODE_HEIGHT) / 2,
  };
}

function getParentInfoSectionCenterY(
  serviceId: string,
  services: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): number | null {
  const isParent = services.some((s) => s.position?.parentId === serviceId);

  if (!isParent) return null;

  const service = services.find((s) => s.id === serviceId);

  if (!service) return null;

  const absPos = getAbsoluteNodePosition(service, services, dragOffsets);
  const infoH = getInfoSectionHeight(serviceId);

  return absPos.y + CARD_BORDER_WIDTH + infoH / 2;
}

export function getPortPosition(
  serviceId: string,
  side: PortSide,
  services: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): { x: number; y: number } | null {
  const service = services.find((s) => s.id === serviceId);

  if (!service) return null;

  const absPos = getAbsoluteNodePosition(service, services, dragOffsets);
  const size = getNodeSize(serviceId);

  const isParent = services.some((s) => s.position?.parentId === serviceId);

  // Container-bottom: bottom-centre of the full container card.
  if (side === PortSide.CONTAINER_BOTTOM) {
    return {
      x: absPos.x + (size?.w ?? NODE_WIDTH) / 2,
      y: absPos.y + (size?.h ?? NODE_HEIGHT),
    };
  }

  // For parent nodes, "bottom" means the header bottom, not the container bottom.
  // This keeps the port-bottom dot (inside DragHandle) and link endpoints consistent.
  if (side === PortSide.BOTTOM && isParent) {
    return {
      x: absPos.x + (size?.w ?? NODE_WIDTH) / 2,
      y: absPos.y + CARD_BORDER_WIDTH + getInfoSectionHeight(serviceId),
    };
  }

  if ((side === PortSide.LEFT || side === PortSide.RIGHT) && isParent) {
    const headerCenterY = getParentInfoSectionCenterY(serviceId, services, dragOffsets);

    if (headerCenterY !== null) {
      const x = side === PortSide.LEFT ? absPos.x : absPos.x + (size?.w ?? NODE_WIDTH);

      return { x, y: headerCenterY };
    }
  }

  return portCoords(
    absPos.x + (size?.w ?? NODE_WIDTH) / 2,
    absPos.y + (size?.h ?? NODE_HEIGHT) / 2,
    side,
    (size?.w ?? NODE_WIDTH) / 2,
    (size?.h ?? NODE_HEIGHT) / 2,
  );
}

export function portCoords(
  cx: number,
  cy: number,
  side: PortSide,
  halfW: number,
  halfH: number,
): { x: number; y: number } {
  if (side === PortSide.LEFT) return { x: cx - halfW, y: cy };

  if (side === PortSide.RIGHT) return { x: cx + halfW, y: cy };

  if (side === PortSide.TOP) return { x: cx, y: cy - halfH };

  return { x: cx, y: cy + halfH };
}

const SPREAD_SPACING = 22; // px between adjacent spread ports
const SPREAD_MARGIN = 14; // min px from node edge when clamping

export function getSpreadPortPosition(
  serviceId: string,
  side: PortSide,
  services: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
  index: number,
  total: number,
): { x: number; y: number } | null {
  const base = getPortPosition(serviceId, side, services, dragOffsets);

  if (!base || total <= 1) return base;

  const offset = (index - (total - 1) / 2) * SPREAD_SPACING;

  const service = services.find((s) => s.id === serviceId);

  if (!service) return base;

  const absPos = getAbsoluteNodePosition(service, services, dragOffsets);
  const size = getNodeSize(serviceId);
  const w = size?.w ?? NODE_WIDTH;
  const h = size?.h ?? NODE_HEIGHT;

  if (side === PortSide.LEFT || side === PortSide.RIGHT) {
    // For parent nodes, constrain spread to the header height, not the full container
    const isParent = services.some((s) => s.position?.parentId === serviceId);
    const effectiveH = isParent ? getInfoSectionHeight(serviceId) : h;
    const minY = absPos.y + SPREAD_MARGIN;
    const maxY = absPos.y + effectiveH - SPREAD_MARGIN;

    return { x: base.x, y: Math.max(minY, Math.min(maxY, base.y + offset)) };
  }

  // TOP, BOTTOM, CONTAINER_BOTTOM — spread horizontally
  const minX = absPos.x + SPREAD_MARGIN;
  const maxX = absPos.x + w - SPREAD_MARGIN;

  return { x: Math.max(minX, Math.min(maxX, base.x + offset)), y: base.y };
}

export function getMinContainerDimensions(
  nodeId: string,
  services: ServiceWithPosition[],
): { minW: number; minH: number } {
  const children = services.filter((s) => s.position?.parentId === nodeId);

  let minBodyW = NODE_WIDTH;
  let minBodyH = NODE_HEIGHT;

  for (const child of children) {
    const cx = child.position?.x ?? 0;
    const cy = child.position?.y ?? 0;
    const size = getNodeSize(child.id!);
    const childW = size?.w ?? NODE_WIDTH;
    const childH = size?.h ?? NODE_HEIGHT;

    minBodyW = Math.max(minBodyW, cx + childW + CONTAINER_PADDING);
    minBodyH = Math.max(minBodyH, cy + childH + CONTAINER_PADDING);
  }

  const headerH = getInfoSectionHeight(nodeId);

  return {
    minW: minBodyW + 2 * CARD_BORDER_WIDTH,
    minH: minBodyH + headerH + 2 * CARD_BORDER_WIDTH,
  };
}
