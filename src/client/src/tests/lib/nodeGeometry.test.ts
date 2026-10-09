import { afterEach, expect, it, vi } from "vitest";

import type { ServiceWithPosition } from "@shared";
import { ServiceSource, ServiceStatus } from "@shared";

import { getAbsoluteNodePosition } from "../../components/dashboard/nodeGeometry";

function node(id: string, parentId?: string): ServiceWithPosition {
  return {
    id,
    name: id,
    host: id,
    ports: [],
    source: ServiceSource.NETWORK,
    status: ServiceStatus.UNKNOWN,
    createdAt: "",
    updatedAt: "",
    position: { serviceId: id, x: 10, y: 20, parentId },
  };
}

afterEach(() => vi.unstubAllGlobals());

it("returns finite geometry for self-parenting and multi-node cycles", () => {
  vi.stubGlobal("document", { querySelector: () => null });

  for (const services of [[node("a", "a")], [node("a", "b"), node("b", "a")]]) {
    const position = getAbsoluteNodePosition(services[0], services, {});

    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  }
});
