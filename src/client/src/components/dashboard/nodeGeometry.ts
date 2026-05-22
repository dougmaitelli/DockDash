import type { ServiceWithPosition } from "@shared";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 120;

export type PortSide = "left" | "right" | "top" | "bottom";

export function getNodeSize(serviceId: string): { w: number; h: number } | null {
  const el = document.querySelector(`[data-service-id="${serviceId}"]`) as HTMLElement | null;

  if (!el) return null;

  return { w: el.offsetWidth, h: el.offsetHeight };
}

export function getNodeCenter(
  serviceId: string,
  services: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): { x: number; y: number } | null {
  const service = services.find((s) => s.id === serviceId);
  const pos = service?.position;
  const offset = dragOffsets[serviceId];
  const dragX = offset?.dx || 0;
  const dragY = offset?.dy || 0;
  let x: number;
  let y: number;

  if (pos) {
    x = pos.x + dragX;
    y = pos.y + dragY;
  } else {
    const idx = services.findIndex((s) => s.id === serviceId);

    if (idx === -1) return null;

    const cols = Math.max(3, Math.ceil(Math.sqrt(services.length)));
    const row = Math.floor(idx / cols);
    const col = idx % cols;

    x = 100 + col * 280 + dragX;
    y = 120 + row * 200 + dragY;
  }

  const size = getNodeSize(serviceId);

  return { x: x + (size?.w || NODE_WIDTH) / 2, y: y + (size?.h || NODE_HEIGHT) / 2 };
}

export function getPortPosition(
  serviceId: string,
  side: PortSide,
  services: ServiceWithPosition[],
  dragOffsets: Record<string, { dx: number; dy: number }>,
): { x: number; y: number } | null {
  const center = getNodeCenter(serviceId, services, dragOffsets);

  if (!center) return null;

  const size = getNodeSize(serviceId);
  const nodeW = size?.w ?? NODE_WIDTH;
  const nodeH = size?.h ?? NODE_HEIGHT;

  if (side === "left") return { x: center.x - nodeW / 2, y: center.y };

  if (side === "right") return { x: center.x + nodeW / 2, y: center.y };

  if (side === "top") return { x: center.x, y: center.y - nodeH / 2 };

  if (side === "bottom") return { x: center.x, y: center.y + nodeH / 2 };

  return null;
}
