import { useState, useCallback, useRef, useEffect } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { colors } from "../../styles/vars";
import { EditLinkModal } from "../modals/EditLinkModal";
import { EditServiceModal } from "../modals/EditServiceModal";
import { ConfirmDialog } from "../modals/ConfirmDialog";
import { ServiceDrawer } from "../modals/ServiceDrawer";
import { dashboardApi } from "../../services/api";
import { ErrorOverlay } from "./ErrorOverlay";
import { EmptyOverlay } from "./EmptyOverlay";
import type { Service, ServiceLink, ServiceWithPosition } from "@shared";
import { ServiceLinkType, ServiceStatus } from "@shared";
import {
  getNodeSize,
  getPortPosition,
  getAbsoluteNodePosition,
  computeGroupDimensions,
  NODE_WIDTH,
  NODE_HEIGHT,
  type PortSide,
} from "./nodeGeometry";
import { LinkLayer } from "./LinkLayer";
import { NodeLayer } from "./NodeLayer";
import { ZoomControls } from "./ZoomControls";
import { IconPlus, IconTrash, IconRefresh, IconCheckCircle } from "../../utils/Icons";
import { SecondaryButton, DangerButton } from "../../utils/ui";

interface DashboardCanvasProps {
  services: ServiceWithPosition[];
  links: ServiceLink[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updatePosition: (
    serviceId: string,
    x: number,
    y: number,
    parentId?: string | null,
  ) => Promise<void>;
  addService: (data: Partial<Service> & { name: string; host: string }) => Promise<Service>;
  updateService: (
    id: string,
    data: Pick<Service, "name" | "host" | "ports" | "checkPort">,
  ) => Promise<void>;
  addLink: (data: Omit<ServiceLink, "id" | "created_at">) => Promise<void>;
  updateLink: (
    id: string,
    data: Pick<ServiceLink, "label" | "type" | "description" | "targetPort" | "protocol">,
  ) => Promise<void>;
  removeLink: (id: string) => Promise<void>;
  removeService: (id: string) => Promise<void>;
}

const CanvasWrapper = styled.div`
  flex: 1;
  position: relative;
  background: ${colors.bgSecondary};
  border: 1px solid ${colors.border};
  border-radius: 10px;
  overflow: hidden;
  min-height: 400px;
`;

const Canvas = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-image: radial-gradient(${colors.border} 1px, transparent 1px);
  background-size: 24px 24px;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${colors.bgCardAlpha90};
  border-bottom: 1px solid ${colors.border};
`;

const ToolButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== "active",
})<{ active?: boolean }>`
  padding: 8px 14px;
  border: 1px solid ${(props) => (props.active ? colors.accentBlue : colors.border)};
  background: ${(props) => (props.active ? colors.accentBlueAlpha15 : "transparent")};
  color: ${(props) => (props.active ? colors.accentBlue : colors.textSecondary)};
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${colors.accentBlue};
    color: ${colors.accentBlue};
  }
`;

const ToolbarInner = styled(Toolbar)`
  justify-content: space-between;
`;

const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

function findNestTarget(
  draggedId: string,
  draggedAbsX: number,
  draggedAbsY: number,
  services: ServiceWithPosition[],
): string | null {
  const cx = draggedAbsX + NODE_WIDTH / 2;
  const cy = draggedAbsY + NODE_HEIGHT / 2;

  for (const svc of services) {
    if (svc.id === draggedId || !svc.id) continue;

    if (svc.position?.parent_id) continue; // can't nest into a child

    const { x: svcX, y: svcY } = getAbsoluteNodePosition(svc, services, {});

    // Existing children (excluding the dragged node itself in case it's re-nesting)
    const currentChildren = services.filter(
      (s) => s.position?.parent_id === svc.id && s.id !== draggedId,
    );

    if (currentChildren.length > 0) {
      // Hit the full group container bounds so the user can drop anywhere inside
      const { w: groupW, h: groupH } = computeGroupDimensions(currentChildren.length);

      if (cx >= svcX && cx <= svcX + groupW && cy >= svcY && cy <= svcY + groupH) {
        return svc.id;
      }
    } else {
      // No children yet: hit only the service card to create a new group
      if (cx >= svcX && cx <= svcX + NODE_WIDTH && cy >= svcY && cy <= svcY + NODE_HEIGHT) {
        return svc.id;
      }
    }
  }

  return null;
}

export function DashboardCanvas({
  services,
  links,
  loading,
  error,
  refresh,
  updatePosition,
  addService,
  updateService,
  addLink,
  updateLink,
  removeLink,
  removeService,
}: DashboardCanvasProps) {
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;

  const { t } = useTranslation();
  const servicesOnline = services.filter((s) => s.status === ServiceStatus.UP).length;
  const servicesWithUpdates = services.filter((s) => s.metadata?.hasUpdate === true).length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ServiceLink | null>(null);
  const [editingNode, setEditingNode] = useState<Service | null>(null);
  const [addingService, setAddingService] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Connection dragging state
  const [connectingSource, setConnectingSource] = useState<{
    serviceId: string;
    side: PortSide;
  } | null>(null);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number } | null>(null);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});

  const [nestingTarget, setNestingTarget] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ w: 0, h: 0 });
  const initialFitDone = useRef(false);
  const canvasW = canvasDimensions.w;
  const canvasH = canvasDimensions.h;

  const selectedService = services.find((s) => s.id === selectedId);

  const fitToContent = useCallback((): boolean => {
    if (services.length === 0) return false;

    if (canvasDimensions.w === 0 || canvasDimensions.h === 0) return false;

    const PADDING = 60;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    services.forEach((service, idx) => {
      let x: number, y: number;

      if (service.position) {
        x = service.position.x;
        y = service.position.y;
      } else {
        const cols = Math.max(3, Math.ceil(Math.sqrt(services.length)));
        const row = Math.floor(idx / cols);
        const col = idx % cols;

        x = 100 + col * (NODE_WIDTH + 60);
        y = 120 + row * (NODE_HEIGHT + 80);
      }

      const size = service.id ? getNodeSize(service.id) : null;
      const nodeW = size?.w ?? NODE_WIDTH;
      const nodeH = size?.h ?? NODE_HEIGHT;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + nodeW);
      maxY = Math.max(maxY, y + nodeH);
    });

    const fitZoom = Math.min(
      (canvasDimensions.w - PADDING * 2) / (maxX - minX),
      (canvasDimensions.h - PADDING * 2) / (maxY - minY),
      1,
    );

    const bboxCenterX = (minX + maxX) / 2;
    const bboxCenterY = (minY + maxY) / 2;

    setPanOffset({
      x: canvasDimensions.w / 2 - bboxCenterX * fitZoom,
      y: canvasDimensions.h / 2 - bboxCenterY * fitZoom,
    });
    setZoomLevel(fitZoom);

    return true;
  }, [services, canvasDimensions]);

  // Initial fit to content
  useEffect(() => {
    if (initialFitDone.current) return;

    if (fitToContent()) initialFitDone.current = true;
  }, [fitToContent]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedId) {
        e.preventDefault();
        setPendingDeleteId(selectedId);
      }
    },
    [selectedId],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Node click — select/deselect
  const handleNodeClick = useCallback(
    (id: string) => {
      setSelectedId(selectedId === id ? null : id);
    },
    [selectedId],
  );

  // Drag handling
  const dragState = useRef<{
    draggedId: string | null;
    nodeX: number;
    nodeY: number;
    grabOffsetX: number;
    grabOffsetY: number;
  }>({ draggedId: null, nodeX: 0, nodeY: 0, grabOffsetX: 0, grabOffsetY: 0 });

  // On mouse down on node, start dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, serviceId: string) => {
      if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a"))
        return;

      e.stopPropagation();
      const canvas = canvasRef.current;

      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;

      // Use absolute position so children (relative coords) are handled correctly
      const service = services.find((s) => s.id === serviceId);
      let nodeX: number;
      let nodeY: number;

      if (service) {
        const abs = getAbsoluteNodePosition(service, services, {});

        nodeX = abs.x;
        nodeY = abs.y;
      } else {
        nodeX = 0;
        nodeY = 0;
      }

      const grabOffsetX = mouseX - nodeX;
      const grabOffsetY = mouseY - nodeY;

      dragState.current = {
        draggedId: serviceId,
        nodeX,
        nodeY,
        grabOffsetX,
        grabOffsetY,
      };
      setDragOffsets((prev) => {
        const copy = { ...prev };

        delete copy[serviceId];

        return copy;
      });
      e.preventDefault();
    },
    [panOffset, zoomLevel, services],
  );

  // On mouse move, update drag offsets for the dragged node
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { draggedId, nodeX, nodeY, grabOffsetX, grabOffsetY } = dragState.current;

      if (!draggedId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const dx = mouseX - nodeX - grabOffsetX;
      const dy = mouseY - nodeY - grabOffsetY;

      setDragOffsets((prev) => ({ ...prev, [draggedId]: { dx, dy } }));

      // Show nesting indicator: only for root nodes without children
      const draggedHasChildren = services.some((s) => s.position?.parent_id === draggedId);
      const draggedService = services.find((s) => s.id === draggedId);
      const isChild = draggedService?.position?.parent_id != null;

      if (!draggedHasChildren && !isChild) {
        const currentAbsX = nodeX + dx;
        const currentAbsY = nodeY + dy;

        setNestingTarget(findNestTarget(draggedId, currentAbsX, currentAbsY, services));
      } else {
        setNestingTarget(null);
      }
    };

    // On mouse up, update position based on where it was dropped
    const handleMouseUp = async (e: MouseEvent) => {
      const { draggedId, grabOffsetX, grabOffsetY } = dragState.current;

      if (!draggedId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const finalAbsX = mouseX - grabOffsetX;
      const finalAbsY = mouseY - grabOffsetY;

      setNestingTarget(null);

      const draggedService = services.find((s) => s.id === draggedId);
      const draggedHasChildren = services.some((s) => s.position?.parent_id === draggedId);
      const currentParentId = draggedService?.position?.parent_id ?? null;

      let newX = finalAbsX;
      let newY = finalAbsY;
      let newParentId: string | null = null;
      let shouldUpdate = true;

      if (currentParentId) {
        // Nested child: snap back to grid if dropped inside group, un-nest if outside
        const parent = services.find((s) => s.id === currentParentId);

        if (parent) {
          const { x: parentX, y: parentY } = getAbsoluteNodePosition(parent, services, {});
          const childCount = services.filter(
            (s) => s.position?.parent_id === currentParentId,
          ).length;
          const { w: groupW, h: groupH } = computeGroupDimensions(childCount);
          const cx = finalAbsX + NODE_WIDTH / 2;
          const cy = finalAbsY + NODE_HEIGHT / 2;
          const insideGroup =
            cx >= parentX && cx <= parentX + groupW && cy >= parentY && cy <= parentY + groupH;

          if (insideGroup) {
            shouldUpdate = false; // snap back to grid position
          } else {
            newParentId = null; // un-nest
          }
        }
      } else if (!draggedHasChildren) {
        // Root node without children: nest onto another node/group if applicable
        const target = findNestTarget(draggedId, finalAbsX, finalAbsY, services);

        if (target) {
          newX = 0;
          newY = 0;
          newParentId = target;
        }
      }
      // Parent nodes (draggedHasChildren) move freely; newParentId stays null

      if (shouldUpdate) {
        await updatePosition(draggedId, newX, newY, newParentId);
      }

      setDragOffsets((prev) => {
        const copy = { ...prev };

        delete copy[draggedId];

        return copy;
      });
      dragState.current.draggedId = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [panOffset, zoomLevel, services, updatePosition]);

  // Port mouse down — start connecting
  const handlePortMouseDown = useCallback(
    (e: React.MouseEvent, serviceId: string, side: PortSide) => {
      e.stopPropagation();
      e.preventDefault();

      const canvas = canvasRef.current;

      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const portPos = getPortPosition(serviceId, side, services, dragOffsets);

      if (!portPos) return;

      setConnectingSource({ serviceId, side });
      setConnectingTarget(null);
      setMouseCanvasPos({
        x: (e.clientX - rect.left - panOffset.x) / zoomLevel,
        y: (e.clientY - rect.top - panOffset.y) / zoomLevel,
      });
    },
    [panOffset, zoomLevel, dragOffsets, services],
  );

  // Port mouse enter — this port is a potential target
  const handlePortMouseEnter = useCallback(
    (serviceId: string) => {
      if (!connectingSource || connectingSource.serviceId === serviceId) return;

      setConnectingTarget(serviceId);
    },
    [connectingSource],
  );

  // Node body mouse enter — also a valid target
  const handleNodeMouseEnter = useCallback(
    (serviceId: string) => {
      if (!connectingSource || connectingSource.serviceId === serviceId) return;

      setConnectingTarget(serviceId);
    },
    [connectingSource],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setConnectingTarget(null);
  }, []);

  const handlePortMouseLeave = useCallback(() => {
    setConnectingTarget(null);
  }, []);

  // Global mouse move — update preview line end
  useEffect(() => {
    if (!connectingSource) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;

      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      setMouseCanvasPos({
        x: (e.clientX - rect.left - panOffset.x) / zoomLevel,
        y: (e.clientY - rect.top - panOffset.y) / zoomLevel,
      });
    };

    const handleMouseUp = async (_e: MouseEvent) => {
      if (connectingTarget && connectingSource && connectingTarget !== connectingSource.serviceId) {
        const alreadyLinked = links.some(
          (l) => l.source_id === connectingSource.serviceId && l.target_id === connectingTarget,
        );

        if (!alreadyLinked) {
          try {
            await addLink({
              source_id: connectingSource.serviceId,
              target_id: connectingTarget,
              label: "",
              type: ServiceLinkType.COMMUNICATION,
              description: "",
            });
            await refresh();
          } catch {
            // ignore
          }
        }
      }

      setConnectingSource(null);
      setConnectingTarget(null);
      setMouseCanvasPos(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [connectingSource, connectingTarget, panOffset, zoomLevel, addLink, refresh, links]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();

      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const currentZoom = zoomLevel;
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * (1 + delta)));
      const zoomRatio = newZoom / currentZoom;

      setPanOffset({
        x: mouseX - (mouseX - panOffset.x) * zoomRatio,
        y: mouseY - (mouseY - panOffset.y) * zoomRatio,
      });
      setZoomLevel(newZoom);
    },
    [panOffset, zoomLevel, MAX_ZOOM, MIN_ZOOM],
  );

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    const updateDimensions = () => {
      setCanvasDimensions({ w: canvas.clientWidth || 1000, h: canvas.clientHeight || 600 });
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);

    resizeObserver.observe(canvas);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      resizeObserver.disconnect();
    };
  }, [handleWheel]);

  // Canvas panning
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".draggable-node")) return;

      if (e.button !== 0) return;

      setSelectedId(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    },
    [panOffset],
  );

  // Global mouse move/up for panning
  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };
    const handleMouseUp = () => setIsPanning(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning, panStart]);

  // Edit link
  const openEditLinkModal = useCallback((link: ServiceLink) => {
    setEditingLink(link);
  }, []);

  const handleEditLinkSave = async (
    data: Pick<ServiceLink, "label" | "type" | "description" | "targetPort" | "protocol">,
  ) => {
    if (!editingLink) return;

    await updateLink(editingLink.id, data);
    setEditingLink(null);
    await refresh();
  };

  const handleEditLinkDelete = async () => {
    if (!editingLink) return;

    await removeLink(editingLink.id);
    setEditingLink(null);
    await refresh();
  };

  // Edit node
  const openEditNodeModal = useCallback((service: Service) => {
    setEditingNode(service);
  }, []);

  const handleEditNodeConfirm = async (
    data: Pick<Service, "name" | "host" | "ports" | "checkPort">,
  ) => {
    if (!editingNode) return;

    await updateService(editingNode.id!, data);
    setEditingNode(null);
    await refresh();
  };

  const handleEditNodeDelete = async () => {
    if (!editingNode) return;

    await removeService(editingNode.id!);
    setEditingNode(null);
    await refresh();
  };

  return (
    <CanvasWrapper>
      <ToolbarInner>
        <ToolbarGroup>
          <span style={{ fontSize: "0.85rem", color: colors.textPrimary, fontWeight: 600 }}>
            {servicesOnline} / {services.length}
          </span>
          <span style={{ fontSize: "0.75rem", color: colors.textMuted }}>
            {t("dashboard.online")}
          </span>
          {servicesWithUpdates > 0 && (
            <>
              <span style={{ color: colors.border }}>·</span>
              <span style={{ fontSize: "0.85rem", color: colors.accentYellow, fontWeight: 600 }}>
                {servicesWithUpdates}
              </span>
              <span style={{ fontSize: "0.75rem", color: colors.textMuted }}>
                {t("dashboard.updates")}
              </span>
            </>
          )}
        </ToolbarGroup>
        <ToolbarGroup>
          <SecondaryButton onClick={() => setAddingService(true)}>
            <IconPlus size={14} />
            {t("dashboard.addService")}
          </SecondaryButton>
          {selectedService && (
            <DangerButton onClick={() => setPendingDeleteId(selectedService.id!)}>
              <IconTrash size={14} />
              {t("dashboard.remove")}
            </DangerButton>
          )}
          <ToolButton title={t("dashboard.refresh")} onClick={() => refresh()}>
            <IconRefresh size={14} />
          </ToolButton>
          <ToolButton
            title={t("dashboard.triggerStatusChecks")}
            onClick={() => dashboardApi.checkAllServices()}
          >
            <IconCheckCircle size={14} />
          </ToolButton>
        </ToolbarGroup>
      </ToolbarInner>

      <Canvas
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        style={{ cursor: isPanning ? "grabbing" : "" }}
      >
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: "0 0",
            width: "100%",
            height: "100%",
            position: "relative",
            pointerEvents: "none",
          }}
        >
          <NodeLayer
            services={services}
            selectedId={selectedId}
            dragOffsets={dragOffsets}
            hoveredNode={hoveredNode}
            nestingTarget={nestingTarget}
            connectingSource={connectingSource}
            onSelect={handleNodeClick}
            onHover={setHoveredNode}
            onDoubleClick={openEditNodeModal}
            onDragStart={handleMouseDown}
            onPortMouseDown={handlePortMouseDown}
            onPortMouseEnter={handlePortMouseEnter}
            onPortMouseLeave={handlePortMouseLeave}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
          />
        </div>

        <LinkLayer
          links={links}
          services={services}
          dragOffsets={dragOffsets}
          panOffset={panOffset}
          zoomLevel={zoomLevel}
          connectingSource={connectingSource}
          mouseCanvasPos={mouseCanvasPos}
          canvasW={canvasW}
          canvasH={canvasH}
          onEditLink={openEditLinkModal}
        />
      </Canvas>

      <ZoomControls
        zoom={zoomLevel}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onZoomIn={() => setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + 0.25))}
        onZoomOut={() => setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - 0.25))}
        onFit={fitToContent}
      />

      {addingService && (
        <EditServiceModal
          onSave={async (data) => {
            await addService(data);
            setAddingService(false);
          }}
          onCancel={() => setAddingService(false)}
        />
      )}

      {editingLink && (
        <EditLinkModal
          link={editingLink}
          onSave={handleEditLinkSave}
          onDelete={handleEditLinkDelete}
          onCancel={() => setEditingLink(null)}
        />
      )}

      {editingNode && (
        <ServiceDrawer
          service={editingNode}
          onSave={handleEditNodeConfirm}
          onDelete={handleEditNodeDelete}
          onClose={() => setEditingNode(null)}
        />
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          message={t("modals.confirmDeleteService")}
          onConfirm={async () => {
            await removeService(pendingDeleteId);

            if (selectedId === pendingDeleteId) setSelectedId(null);

            if (editingNode?.id === pendingDeleteId) setEditingNode(null);

            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {services.length === 0 && !editingLink && !error && <EmptyOverlay />}

      {error && !loading && <ErrorOverlay message={error} onRetry={refresh} />}
    </CanvasWrapper>
  );
}
