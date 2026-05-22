import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { EditLinkModal } from "../modals/EditLinkModal";
import { EditServiceModal } from "../modals/EditServiceModal";
import { dashboardApi } from "../../services/api";
import {
  CanvasWrapper,
  Canvas,
  Toolbar,
  ToolButton,
  EmptyState,
} from "../../styles/Dashboard.styles";
import type { Service, ServiceLink, ServiceWithPosition } from "@shared";
import { orthogonalPath, getLinkColor, type LinkPath } from "./linkUtils";
import { ServiceLinkType, ServiceStatus } from "@shared";
import {
  getNodeCenter,
  getNodeSize,
  getPortPosition,
  NODE_WIDTH,
  NODE_HEIGHT,
  type PortSide,
} from "./nodeGeometry";
import { LinkLayer } from "./LinkLayer";
import { NodeLayer } from "./NodeLayer";
import { ZoomControls } from "./ZoomControls";
import { IconPlus, IconTrash, IconRefresh, IconCheckCircle, IconServer } from "../../utils/Icons";

interface DashboardCanvasProps {
  services: ServiceWithPosition[];
  links: ServiceLink[];
  refresh: () => Promise<void>;
  updatePosition: (serviceId: string, x: number, y: number) => Promise<void>;
  addService: (data: Partial<Service> & { name: string; host: string }) => Promise<Service>;
  updateService: (
    id: string,
    data: Pick<Service, "name" | "host" | "port" | "protocol">,
  ) => Promise<void>;
  addLink: (data: Omit<ServiceLink, "id" | "created_at">) => Promise<void>;
  updateLink: (
    id: string,
    data: Pick<ServiceLink, "label" | "type" | "description">,
  ) => Promise<void>;
  removeLink: (id: string) => Promise<void>;
  removeService: (id: string) => Promise<void>;
}

const ToolbarInner = styled(Toolbar)`
  justify-content: space-between;
`;

const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ActionButton = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const PrimaryButton = styled(ActionButton)`
  background: #3b82f6;
  color: white;

  &:hover {
    background: #2563eb;
  }
`;

const SecondaryButton = styled(ActionButton)`
  background: transparent;
  border: 1px solid #2d3348;
  color: #9ca3b8;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
`;

const DangerButton = styled(ActionButton)`
  background: transparent;
  border: 1px solid #2d3348;
  color: #ef4444;

  &:hover {
    border-color: #ef4444;
  }
`;

export function DashboardCanvas({
  services,
  links,
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

  const servicesOnline = services.filter((s) => s.status === ServiceStatus.UP).length;

  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ServiceLink | null>(null);
  const [editingNode, setEditingNode] = useState<Service | null>(null);
  const [addingService, setAddingService] = useState(false);

  // Connection dragging state
  const [connectingSource, setConnectingSource] = useState<{
    serviceId: string;
    side: PortSide;
  } | null>(null);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number } | null>(null);

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [zoomLevel, setZoomLevel] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeHoverRef = useRef<string | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ w: 0, h: 0 });
  const initialFitDone = useRef(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedId) {
        e.preventDefault();
        removeService(selectedId);
        setSelectedId(null);
      }
    },
    [removeService, selectedId],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (initialFitDone.current) return;

    if (services.length === 0) return;

    if (canvasDimensions.w === 0 || canvasDimensions.h === 0) return;

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
    initialFitDone.current = true;
  }, [services, canvasDimensions]);

  const handleNodeClick = useCallback(
    (id: string) => {
      setSelectedId(selectedId === id ? null : id);
    },
    [selectedId],
  );

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

  // Node body mouse enter — also a valid target (closest port will be used)
  const handleNodeMouseEnter = useCallback(
    (serviceId: string) => {
      if (!connectingSource || connectingSource.serviceId === serviceId) return;

      nodeHoverRef.current = serviceId;
      setConnectingTarget(serviceId);
    },
    [connectingSource],
  );

  const handleNodeMouseLeave = useCallback(() => {
    nodeHoverRef.current = null;
    setConnectingTarget(null);
  }, []);

  const handlePortMouseLeave = useCallback(() => {
    if (nodeHoverRef.current) return;

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

  // Drag handling
  const dragState = useRef<{
    draggedId: string | null;
    nodeX: number;
    nodeY: number;
    grabOffsetX: number;
    grabOffsetY: number;
  }>({ draggedId: null, nodeX: 0, nodeY: 0, grabOffsetX: 0, grabOffsetY: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { draggedId, nodeX, nodeY, grabOffsetX, grabOffsetY } = dragState.current;

      if (!draggedId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const dx = mouseX - nodeX - grabOffsetX;
      const dy = mouseY - nodeY - grabOffsetY;

      setDragOffsets((prev) => ({
        ...prev,
        [draggedId]: { dx, dy },
      }));
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const { draggedId, grabOffsetX, grabOffsetY } = dragState.current;

      if (!draggedId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const finalNodeX = mouseX - grabOffsetX;
      const finalNodeY = mouseY - grabOffsetY;

      await updatePosition(draggedId, finalNodeX, finalNodeY);
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

      const pos = services.find((s) => s.id === serviceId)?.position;
      let nodeX: number;
      let nodeY: number;

      if (pos) {
        nodeX = pos.x;
        nodeY = pos.y;
      } else {
        const idx = services.findIndex((s) => s.id === serviceId);
        const cols = Math.max(3, Math.ceil(Math.sqrt(services.length)));
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const gapX = 60;
        const gapY = 80;

        nodeX = 100 + col * (NODE_WIDTH + gapX);
        nodeY = 120 + row * (NODE_HEIGHT + gapY);
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

  const canvasW = canvasDimensions.w;
  const canvasH = canvasDimensions.h;

  // Compute existing link SVG paths
  const linkPaths = useMemo<LinkPath[]>(() => {
    return links
      .map((link) => {
        const srcCenter = getNodeCenter(link.source_id, services, dragOffsets);
        const tgtCenter = getNodeCenter(link.target_id, services, dragOffsets);

        if (!srcCenter || !tgtCenter) return null;

        const sx = srcCenter.x * zoomLevel + panOffset.x;
        const sy = srcCenter.y * zoomLevel + panOffset.y;
        const tx = tgtCenter.x * zoomLevel + panOffset.x;
        const ty = tgtCenter.y * zoomLevel + panOffset.y;

        const dx = tx - sx;
        const dy = ty - sy;
        const useHorizontal = Math.abs(dx) >= Math.abs(dy);

        let x1: number, y1: number, x2: number, y2: number;
        let exitSide: PortSide, entrySide: PortSide;

        const srcEl = document.querySelector(
          `[data-service-id="${link.source_id}"]`,
        ) as HTMLElement | null;
        const tgtEl = document.querySelector(
          `[data-service-id="${link.target_id}"]`,
        ) as HTMLElement | null;
        const srcHalfW = ((srcEl?.offsetWidth ?? NODE_WIDTH) * zoomLevel) / 2;
        const srcHalfH = ((srcEl?.offsetHeight ?? NODE_HEIGHT) * zoomLevel) / 2;
        const tgtHalfW = ((tgtEl?.offsetWidth ?? NODE_WIDTH) * zoomLevel) / 2;
        const tgtHalfH = ((tgtEl?.offsetHeight ?? NODE_HEIGHT) * zoomLevel) / 2;

        if (useHorizontal) {
          if (dx >= 0) {
            x1 = sx + srcHalfW;
            y1 = sy;
            exitSide = "right";
            x2 = tx - tgtHalfW;
            y2 = ty;
            entrySide = "left";
          } else {
            x1 = sx - srcHalfW;
            y1 = sy;
            exitSide = "left";
            x2 = tx + tgtHalfW;
            y2 = ty;
            entrySide = "right";
          }
        } else {
          if (dy >= 0) {
            x1 = sx;
            y1 = sy + srcHalfH;
            exitSide = "bottom";
            x2 = tx;
            y2 = ty - tgtHalfH;
            entrySide = "top";
          } else {
            x1 = sx;
            y1 = sy - srcHalfH;
            exitSide = "top";
            x2 = tx;
            y2 = ty + tgtHalfH;
            entrySide = "bottom";
          }
        }

        return {
          id: link.id,
          d: orthogonalPath(x1, y1, exitSide, x2, y2, entrySide, zoomLevel),
          link,
          color: getLinkColor(link.type),
        };
      })
      .filter((p): p is LinkPath => p !== null);
  }, [links, services, dragOffsets, panOffset, zoomLevel]);

  // Compute connecting preview path
  const previewPath = useMemo(() => {
    if (!connectingSource || !mouseCanvasPos) return null;

    const srcPort = getPortPosition(
      connectingSource.serviceId,
      connectingSource.side,
      services,
      dragOffsets,
    );

    if (!srcPort) return null;

    const sx = srcPort.x * zoomLevel + panOffset.x;
    const sy = srcPort.y * zoomLevel + panOffset.y;
    const tx = mouseCanvasPos.x * zoomLevel + panOffset.x;
    const ty = mouseCanvasPos.y * zoomLevel + panOffset.y;

    const pdx = tx - sx;
    const pdy = ty - sy;
    let entrySide: PortSide;

    if (Math.abs(pdx) >= Math.abs(pdy)) {
      entrySide = pdx >= 0 ? "left" : "right";
    } else {
      entrySide = pdy >= 0 ? "top" : "bottom";
    }

    return orthogonalPath(sx, sy, connectingSource.side, tx, ty, entrySide, zoomLevel);
  }, [connectingSource, mouseCanvasPos, services, dragOffsets, panOffset, zoomLevel]);

  const selectedService = services.find((s) => s.id === selectedId);

  const openEditModal = useCallback((link: ServiceLink) => {
    setEditingLink(link);
  }, []);

  const handleLinkEditSave = async (data: Pick<ServiceLink, "label" | "type" | "description">) => {
    if (!editingLink) return;

    await updateLink(editingLink.id, data);
    setEditingLink(null);
    await refresh();
  };

  const handleLinkEditDelete = async () => {
    if (!editingLink) return;

    await removeLink(editingLink.id);
    setEditingLink(null);
    await refresh();
  };

  const openEditNodeModal = useCallback((service: Service) => {
    setEditingNode(service);
  }, []);

  const handleEditNodeConfirm = async (
    data: Pick<Service, "name" | "host" | "port" | "protocol">,
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
          <span style={{ fontSize: "0.85rem", color: "#e8eaf0", fontWeight: 600 }}>
            {servicesOnline} / {services.length}
          </span>
          <span style={{ fontSize: "0.75rem", color: "#6b7290" }}>Online</span>
        </ToolbarGroup>
        <ToolbarGroup>
          <SecondaryButton onClick={() => setAddingService(true)}>
            <IconPlus size={13} />
            Add Service
          </SecondaryButton>
          {selectedService && (
            <DangerButton
              onClick={async () => {
                await removeService(selectedService.id!);
                setSelectedId(null);
              }}
            >
              <IconTrash size={13} />
              Remove
            </DangerButton>
          )}
          <ToolButton title="Refresh" onClick={() => refresh()}>
            <IconRefresh size={14} />
          </ToolButton>
          <ToolButton title="Trigger status checks" onClick={() => dashboardApi.checkAllServices()}>
            <IconCheckCircle size={14} />
          </ToolButton>
        </ToolbarGroup>
      </ToolbarInner>

      <Canvas
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        style={{ cursor: isPanning ? "grabbing" : "" }}
      >
        <LinkLayer
          linkPaths={linkPaths}
          previewPath={previewPath}
          canvasW={canvasW}
          canvasH={canvasH}
          onEditLink={openEditModal}
        />

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
            dragOffsets={dragOffsets}
            selectedId={selectedId}
            hoveredNode={hoveredNode}
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
      </Canvas>

      <ZoomControls
        zoom={zoomLevel}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onZoomIn={() => setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + 0.25))}
        onZoomOut={() => setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - 0.25))}
        onReset={() => {
          setPanOffset({ x: 0, y: 0 });
          setZoomLevel(1);
        }}
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
          onSave={handleLinkEditSave}
          onDelete={handleLinkEditDelete}
          onCancel={() => setEditingLink(null)}
        />
      )}

      {editingNode && (
        <EditServiceModal
          service={editingNode}
          onSave={handleEditNodeConfirm}
          onDelete={handleEditNodeDelete}
          onCancel={() => setEditingNode(null)}
        />
      )}

      {services.length === 0 && !editingLink && (
        <EmptyState>
          <IconServer size={48} />
          <span>No services yet. Go to Discovery to find services.</span>
          <PrimaryButton onClick={() => navigate("/discover")}>⚡ Go to Discovery</PrimaryButton>
        </EmptyState>
      )}
    </CanvasWrapper>
  );
}
