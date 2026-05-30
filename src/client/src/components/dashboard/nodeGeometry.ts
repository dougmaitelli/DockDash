import type { ServiceWithPosition } from "@shared";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 120;
export const CHILD_ROW_GAP = 20;
export const CHILD_COLUMN_GAP = 60;
export const CARD_BORDER_WIDTH = 3;

// Height of the parent service card's own info section (name/host/status/badges).
// Used to offset children below it in the expanded card.
export const GROUP_PARENT_INFO_HEIGHT = 110;
// Inner padding on the children section (left/right and top/bottom of children area).
export const GROUP_CARD_INNER_PADDING = 10;

export type PortSide = "left" | "right" | "top" | "bottom";

export function getAbsoluteNodePosition(
  service: ServiceWithPosition,
  allServices: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): { x: number; y: number } {
  const pos = service.position;
  const offset = dragOffsets[service.id!] || { dx: 0, dy: 0 };

  if (!pos?.parent_id) {
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

  const parent = allServices.find((s) => s.id === pos.parent_id);

  if (!parent) {
    return { x: pos.x + offset.dx, y: pos.y + offset.dy };
  }

  const parentAbs = getAbsoluteNodePosition(parent, allServices, dragOffsets);

  // Read the child's actual DOM position relative to the parent's absolute wrapper.
  // This avoids relying on the GROUP_PARENT_INFO_HEIGHT approximation — the real InfoSection
  // height depends on font rendering and content and can't be known statically.
  // The child wrapper uses `transform: translate` for drag (not offsetLeft/Top), so the
  // DOM offsets are drag-free and we add offset.dx/dy explicitly.
  const childEl = document.querySelector(`[data-service-id="${service.id}"]`) as HTMLElement | null;
  const parentEl = document.querySelector(
    `[data-service-id="${pos.parent_id}"]`,
  ) as HTMLElement | null;

  if (childEl && parentEl?.offsetParent) {
    const parentWrapper = parentEl.offsetParent as HTMLElement;
    let relX = 0;
    let relY = 0;
    let el: HTMLElement | null = childEl;

    while (el && el !== parentWrapper) {
      relX += el.offsetLeft;
      relY += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }

    // offsetLeft/offsetTop measure to the offsetParent's *padding* edge, but parentAbs
    // is at the NodeCard's *border* edge. Add CARD_BORDER_WIDTH to correct the gap.
    return {
      x: parentAbs.x + relX + CARD_BORDER_WIDTH + offset.dx,
      y: parentAbs.y + relY + CARD_BORDER_WIDTH + offset.dy,
    };
  }

  // Fallback when DOM isn't available yet (e.g. first render before mount)
  const siblings = sortSiblings(allServices.filter((s) => s.position?.parent_id === pos.parent_id));
  const idx = siblings.findIndex((s) => s.id === service.id);

  if (idx === -1) {
    return {
      x: parentAbs.x + GROUP_CARD_INNER_PADDING + offset.dx,
      y: parentAbs.y + GROUP_PARENT_INFO_HEIGHT + GROUP_CARD_INNER_PADDING + offset.dy,
    };
  }

  const grid = childGridPosition(idx, siblings.length);

  return {
    x: parentAbs.x + grid.x + offset.dx,
    y: parentAbs.y + GROUP_PARENT_INFO_HEIGHT + grid.y + offset.dy,
  };
}

export function getNodeSize(serviceId: string): { w: number; h: number } | null {
  const el = document.querySelector(`[data-service-id="${serviceId}"]`) as HTMLElement | null;

  if (!el) return null;

  return { w: el.offsetWidth ?? NODE_WIDTH, h: el.offsetHeight ?? NODE_HEIGHT };
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
  const isParent = services.some((s) => s.position?.parent_id === serviceId);

  if (!isParent) return null;

  const service = services.find((s) => s.id === serviceId);

  if (!service) return null;

  const absPos = getAbsoluteNodePosition(service, services, dragOffsets);
  const infoEl = document.querySelector(
    `[data-service-id="${serviceId}"] [data-info-section]`,
  ) as HTMLElement | null;
  const infoH = infoEl?.offsetHeight ?? GROUP_PARENT_INFO_HEIGHT;

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

  if (side === "left" || side === "right") {
    const headerCenterY = getParentInfoSectionCenterY(serviceId, services, dragOffsets);

    if (headerCenterY !== null) {
      const x = side === "left" ? absPos.x : absPos.x + (size?.w ?? NODE_WIDTH);

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
  if (side === "left") return { x: cx - halfW, y: cy };

  if (side === "right") return { x: cx + halfW, y: cy };

  if (side === "top") return { x: cx, y: cy - halfH };

  return { x: cx, y: cy + halfH };
}

/**
 * Width/height of the parent card when expanded to hold `childCount` children.
 */
export function computeGroupDimensions(childCount: number): { w: number; h: number } {
  const cols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(childCount))));
  const rows = Math.max(1, Math.ceil(childCount / cols));

  const childrenW = cols * NODE_WIDTH + (cols - 1) * CHILD_COLUMN_GAP;
  const childrenH = rows * NODE_HEIGHT + (rows - 1) * CHILD_ROW_GAP;

  // Width includes borders (border-box sizing) so content area = w - 2*CARD_BORDER_WIDTH
  return {
    w: Math.max(NODE_WIDTH, 2 * CARD_BORDER_WIDTH + 2 * GROUP_CARD_INNER_PADDING + childrenW),
    h: GROUP_PARENT_INFO_HEIGHT + GROUP_CARD_INNER_PADDING + childrenH + GROUP_CARD_INNER_PADDING,
  };
}

/**
 * Position of child index `i` (out of `total`) within the children section,
 * i.e. relative to the top-left of the children area (below the info section).
 */
export function childGridPosition(index: number, total: number): { x: number; y: number } {
  const cols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(total))));
  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    x: GROUP_CARD_INNER_PADDING + col * (NODE_WIDTH + CHILD_COLUMN_GAP),
    y: GROUP_CARD_INNER_PADDING + row * (NODE_HEIGHT + CHILD_ROW_GAP),
  };
}

export function sortSiblings(siblings: ServiceWithPosition[]): ServiceWithPosition[] {
  return [...siblings].sort((a, b) => {
    const tA = a.created_at || "";
    const tB = b.created_at || "";

    if (tA !== tB) return tA < tB ? -1 : 1;

    return (a.id || "") < (b.id || "") ? -1 : 1;
  });
}

/**
 * For child nodes inside a group, returns the port side that links should use so
 * connections always exit/enter from the outer edges of the group rather than
 * crossing through the parent card body.
 * Returns null for root nodes, parents, or middle columns (automatic routing).
 */
export function getChildForcedSide(
  serviceId: string,
  services: ServiceWithPosition[],
): PortSide | null {
  const service = services.find((s) => s.id === serviceId);

  if (!service?.position?.parent_id) return null;

  const siblings = sortSiblings(
    services.filter((s) => s.position?.parent_id === service.position!.parent_id),
  );

  const cols = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(siblings.length))));

  if (cols === 1) return null;

  const idx = siblings.findIndex((s) => s.id === serviceId);

  if (idx === -1) return null;

  const col = idx % cols;

  if (col === 0) return "left";

  if (col === cols - 1) return "right";

  return null;
}
