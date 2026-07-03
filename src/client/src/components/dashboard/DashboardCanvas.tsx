import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service, ServiceLink, ServiceWithPosition } from "@shared";
import { ServiceLinkType, ServiceSource, ServiceStatus } from "@shared";
import type {
  CreateLinkRequest,
  CreateServiceRequest,
  UpdateLinkRequest,
  UpdateServiceRequest,
} from "@shared/api";

import { Icons } from "@/components/Icons";
import { Button } from "@/components/ui/Button";

import { dashboardApi } from "../../services/api";
import { AddServiceModal } from "../modals/AddServiceModal";
import { EditLinkModal } from "../modals/EditLinkModal";
import { ServiceDrawer, Tab as DrawerTab } from "../modals/ServiceDrawer";
import { EmptyOverlay } from "./EmptyOverlay";
import { ErrorOverlay } from "./ErrorOverlay";
import { LinkLayer } from "./LinkLayer";
import {
  CARD_BORDER_WIDTH,
  CONTAINER_PADDING,
  DEFAULT_CONTAINER_HEIGHT,
  DEFAULT_CONTAINER_WIDTH,
  getAbsoluteNodePosition,
  getInfoSectionHeight,
  getMinContainerDimensions,
  getNodeSize,
  getPortPosition,
  NODE_HEIGHT,
  NODE_WIDTH,
  PortSide,
} from "./nodeGeometry";
import { NodeLayer } from "./NodeLayer";
import type { ResizeDirection } from "./ServiceNode";
import { UpdatesPopover } from "./UpdatesPopover";
import { ZoomControls } from "./ZoomControls";

import "./DashboardCanvas.css";

interface DashboardCanvasProps {
  allServices: Service[];
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
    w?: number | null,
    h?: number | null,
  ) => Promise<void>;
  addService: (data: CreateServiceRequest) => Promise<Service>;
  updateService: (id: string, data: UpdateServiceRequest) => Promise<void>;
  addLink: (data: CreateLinkRequest) => Promise<void>;
  updateLink: (id: string, data: UpdateLinkRequest) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  removeFromDashboard: (id: string) => Promise<void>;
  removeLink: (id: string) => Promise<void>;
}

function findNestTarget(
  services: ServiceWithPosition[],
  draggedId: string,
  draggedAbsX: number,
  draggedAbsY: number,
): string | null {
  const draggedSize = getNodeSize(draggedId);
  const cx = draggedAbsX + (draggedSize?.w ?? NODE_WIDTH) / 2;
  const cy = draggedAbsY + (draggedSize?.h ?? NODE_HEIGHT) / 2;

  for (const svc of services) {
    if (svc.id === draggedId || !svc.id) continue;

    if (svc.position?.parentId) continue; // can't nest into a child

    const { x: svcX, y: svcY } = getAbsoluteNodePosition(svc, services, {});

    const hasChildren = services.some((s) => s.position?.parentId === svc.id && s.id !== draggedId);

    if (hasChildren) {
      const containerW = svc.position?.w ?? DEFAULT_CONTAINER_WIDTH;
      const containerH = svc.position?.h ?? DEFAULT_CONTAINER_HEIGHT;

      if (cx >= svcX && cx <= svcX + containerW && cy >= svcY && cy <= svcY + containerH) {
        return svc.id;
      }
    } else {
      const size = getNodeSize(svc.id);
      const nodeW = size?.w ?? NODE_WIDTH;
      const nodeH = size?.h ?? NODE_HEIGHT;

      if (cx >= svcX && cx <= svcX + nodeW && cy >= svcY && cy <= svcY + nodeH) {
        return svc.id;
      }
    }
  }

  return null;
}

export function DashboardCanvas({
  allServices,
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
  removeFromDashboard,
}: DashboardCanvasProps) {
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;
  const GRID_SIZE = 24;
  const MOUSE_BUTTON_LEFT = 0;
  const MOUSE_BUTTON_MIDDLE = 1;

  const { t } = useTranslation();

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ w: 0, h: 0 });

  const servicesOnline = services.filter((s) => s.status === ServiceStatus.UP).length;
  const servicesWithUpdates = allServices.filter((s) => s.metadata?.hasUpdate === true);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const initialFitDone = useRef(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedService = services.find((s) => s.id === selectedId);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [addingService, setAddingService] = useState(false);
  const [editingLink, setEditingLink] = useState<ServiceLink | null>(null);
  const [editingNode, setEditingNode] = useState<Service | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab | undefined>(undefined);

  const handleRemoveFromDashboard = useCallback(
    async (id: string) => {
      await removeFromDashboard(id);

      if (selectedId === id) setSelectedId(null);

      if (editingNode?.id === id) setEditingNode(null);
    },
    [removeFromDashboard, selectedId, editingNode],
  );

  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [nestingTarget, setNestingTarget] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [snapToGrid, setSnapToGrid] = useState(() => {
    const stored = localStorage.getItem("dockdash.snapToGrid");

    return stored === null ? true : stored === "true";
  });
  const snapToGridRef = useRef(snapToGrid);

  useEffect(() => {
    snapToGridRef.current = snapToGrid;
    localStorage.setItem("dockdash.snapToGrid", String(snapToGrid));
  }, [snapToGrid]);

  const snapCoord = (v: number) =>
    snapToGridRef.current ? Math.round(v / GRID_SIZE) * GRID_SIZE : v;

  const resizeState = useRef<{
    nodeId: string | null;
    startMouseX: number;
    startMouseY: number;
    startW: number;
    startH: number;
  }>({ nodeId: null, startMouseX: 0, startMouseY: 0, startW: 0, startH: 0 });
  const [resizeDimensions, setResizeDimensions] = useState<
    Record<string, { w: number; h: number }>
  >({});
  const [isResizing, setIsResizing] = useState(false);

  // Connection dragging state
  const [connectingSource, setConnectingSource] = useState<{
    serviceId: string;
    side: PortSide;
  } | null>(null);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number } | null>(null);

  const fitToContent = useCallback((): boolean => {
    if (services.length === 0) return false;

    if (canvasDimensions.w === 0 || canvasDimensions.h === 0) return false;

    const PADDING = 60;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    services.forEach((service) => {
      // Child services have parent-relative positions, not canvas coordinates.
      // Their bounds are already covered by the parent container's DOM size.
      if (service.position?.parentId) return;

      // Skip services whose position hasn't loaded yet — the effect will
      // retry once positions arrive from /api/dashboard.
      if (!service.position) return;

      const { x, y } = service.position;

      const domSize = service.id ? getNodeSize(service.id) : null;
      const isContainer = services.some((s) => s.position?.parentId === service.id);
      const nodeW =
        domSize?.w ?? (isContainer ? (service.position?.w ?? DEFAULT_CONTAINER_WIDTH) : NODE_WIDTH);
      const nodeH =
        domSize?.h ??
        (isContainer ? (service.position?.h ?? DEFAULT_CONTAINER_HEIGHT) : NODE_HEIGHT);

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + nodeW);
      maxY = Math.max(maxY, y + nodeH);
    });

    if (minX === Infinity) return false;

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
        void handleRemoveFromDashboard(selectedId);
      }
    },
    [selectedId, handleRemoveFromDashboard],
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
    hasMoved: boolean;
  }>({ draggedId: null, nodeX: 0, nodeY: 0, grabOffsetX: 0, grabOffsetY: 0, hasMoved: false });

  // On mouse down on node, start dragging
  const handleDragStart = useCallback(
    (e: React.MouseEvent, serviceId: string) => {
      if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a"))
        return;

      if (e.button !== MOUSE_BUTTON_LEFT) return;

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
        hasMoved: false,
      };
      setIsDragging(true);
      setDragOffsets((prev) => {
        const copy = { ...prev };

        delete copy[serviceId];

        return copy;
      });
      e.preventDefault();
    },
    [panOffset, zoomLevel, services],
  );

  // Drag: live offset on mousemove, commit position on mouseup
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const { draggedId, nodeX, nodeY, grabOffsetX, grabOffsetY } = dragState.current;

      if (!draggedId) return;

      dragState.current.hasMoved = true;

      const dx = snapCoord(mouseX - grabOffsetX) - nodeX;
      const dy = snapCoord(mouseY - grabOffsetY) - nodeY;

      setDragOffsets((prev) => ({ ...prev, [draggedId]: { dx, dy } }));

      // Nesting indicator: only for root nodes without children
      const draggedHasChildren = services.some((s) => s.position?.parentId === draggedId);
      const draggedService = services.find((s) => s.id === draggedId);
      const isChild = draggedService?.position?.parentId != null;

      if (!draggedHasChildren && !isChild) {
        setNestingTarget(findNestTarget(services, draggedId, nodeX + dx, nodeY + dy));
      } else {
        setNestingTarget(null);
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const { draggedId, grabOffsetX, grabOffsetY, hasMoved } = dragState.current;

      if (!draggedId || !canvasRef.current) return;

      if (!hasMoved) {
        dragState.current.draggedId = null;
        setIsDragging(false);

        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const finalAbsX = snapCoord(mouseX - grabOffsetX);
      const finalAbsY = snapCoord(mouseY - grabOffsetY);

      setNestingTarget(null);

      const draggedService = services.find((s) => s.id === draggedId);
      const draggedHasChildren = services.some((s) => s.position?.parentId === draggedId);
      const currentParentId = draggedService?.position?.parentId ?? null;

      let newX = finalAbsX;
      let newY = finalAbsY;
      let newParentId: string | null = null;

      if (currentParentId) {
        // Nested child: compute relative position within container body, or un-nest if dropped outside
        const parent = services.find((s) => s.id === currentParentId);

        if (parent) {
          const { x: parentX, y: parentY } = getAbsoluteNodePosition(parent, services, {});
          const containerW = parent.position?.w ?? DEFAULT_CONTAINER_WIDTH;
          const containerH = parent.position?.h ?? DEFAULT_CONTAINER_HEIGHT;
          const draggedSize = getNodeSize(draggedId);
          const cx = finalAbsX + (draggedSize?.w ?? NODE_WIDTH) / 2;
          const cy = finalAbsY + (draggedSize?.h ?? NODE_HEIGHT) / 2;
          const insideContainer =
            cx >= parentX &&
            cx <= parentX + containerW &&
            cy >= parentY &&
            cy <= parentY + containerH;

          if (insideContainer) {
            const headerH = getInfoSectionHeight(currentParentId);

            newX = Math.max(0, finalAbsX - parentX - CARD_BORDER_WIDTH);
            newY = Math.max(0, finalAbsY - parentY - CARD_BORDER_WIDTH - headerH);
            newParentId = currentParentId;
          } else {
            // Un-nest: place at absolute canvas position
            newParentId = null;
          }
        }
      } else if (!draggedHasChildren) {
        // Root node without children: nest onto another node if applicable
        const target = findNestTarget(services, draggedId, finalAbsX, finalAbsY);

        if (target) {
          const targetSvc = services.find((s) => s.id === target);

          // Ensure the target has container dimensions saved (position may be null if never dragged)
          const { x: targetX, y: targetY } = getAbsoluteNodePosition(targetSvc!, services, {});

          if (!targetSvc?.position?.w) {
            await updatePosition(
              target,
              targetSvc?.position?.x ?? targetX,
              targetSvc?.position?.y ?? targetY,
              null,
              DEFAULT_CONTAINER_WIDTH,
              DEFAULT_CONTAINER_HEIGHT,
            );
          }

          const headerH = getInfoSectionHeight(target);

          newX = Math.max(CONTAINER_PADDING, finalAbsX - targetX - CARD_BORDER_WIDTH);
          newY = Math.max(CONTAINER_PADDING, finalAbsY - targetY - CARD_BORDER_WIDTH - headerH);
          newParentId = target;
        }
      }

      // Parent nodes (draggedHasChildren) move freely — preserve their w/h
      const existingPos = draggedService?.position;
      const wToSave = draggedHasChildren ? (existingPos?.w ?? null) : null;
      const hToSave = draggedHasChildren ? (existingPos?.h ?? null) : null;

      await updatePosition(draggedId, newX, newY, newParentId, wToSave, hToSave);

      setDragOffsets((prev) => {
        const copy = { ...prev };

        delete copy[draggedId];

        return copy;
      });
      dragState.current.draggedId = null;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, panOffset, zoomLevel, services, updatePosition]);

  // Resize start — records mouse + current container dimensions
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, serviceId: string, _direction: ResizeDirection) => {
      e.stopPropagation();
      e.preventDefault();

      const canvas = canvasRef.current;

      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const service = services.find((s) => s.id === serviceId);

      resizeState.current = {
        nodeId: serviceId,
        startMouseX: (e.clientX - rect.left - panOffset.x) / zoomLevel,
        startMouseY: (e.clientY - rect.top - panOffset.y) / zoomLevel,
        startW: service?.position?.w ?? DEFAULT_CONTAINER_WIDTH,
        startH: service?.position?.h ?? DEFAULT_CONTAINER_HEIGHT,
      };
      setIsResizing(true);
    },
    [services, panOffset, zoomLevel],
  );

  // Resize: live preview on mousemove, commit on mouseup
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const {
        nodeId: resizeNodeId,
        startMouseX,
        startMouseY,
        startW,
        startH,
      } = resizeState.current;

      if (!resizeNodeId) return;

      const { minW, minH } = getMinContainerDimensions(resizeNodeId, services);
      const newW = Math.max(minW, startW + (mouseX - startMouseX));
      const newH = Math.max(minH, startH + (mouseY - startMouseY));

      setResizeDimensions((prev) => ({ ...prev, [resizeNodeId]: { w: newW, h: newH } }));
    };

    const handleMouseUp = async (e: MouseEvent) => {
      const { nodeId: resizeNodeId, startW, startH } = resizeState.current;

      if (!resizeNodeId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const { minW, minH } = getMinContainerDimensions(resizeNodeId, services);
      const newW = Math.max(minW, startW + (mouseX - resizeState.current.startMouseX));
      const newH = Math.max(minH, startH + (mouseY - resizeState.current.startMouseY));
      const service = services.find((s) => s.id === resizeNodeId);

      if (service) {
        const pos = service.position;
        const absPos = getAbsoluteNodePosition(service, services, {});

        await updatePosition(
          resizeNodeId,
          pos?.x ?? absPos.x,
          pos?.y ?? absPos.y,
          pos?.parentId ?? null,
          newW,
          newH,
        );
      }

      resizeState.current.nodeId = null;
      setResizeDimensions((prev) => {
        const copy = { ...prev };

        delete copy[resizeNodeId];

        return copy;
      });
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, panOffset, zoomLevel, services, updatePosition]);

  // Port mouse down — start connecting
  const handlePortMouseDown = useCallback(
    (e: React.MouseEvent, serviceId: string, side: PortSide) => {
      if (e.button !== MOUSE_BUTTON_LEFT) return;

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
          (l) => l.sourceId === connectingSource.serviceId && l.targetId === connectingTarget,
        );

        if (!alreadyLinked) {
          try {
            await addLink({
              sourceId: connectingSource.serviceId,
              targetId: connectingTarget,
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
      if (e.button === MOUSE_BUTTON_LEFT) {
        if ((e.target as HTMLElement).closest(".draggable-node")) return;

        setSelectedId(null);

        return;
      }

      if (e.button !== MOUSE_BUTTON_MIDDLE) return;

      e.preventDefault(); // suppress browser auto-scroll on middle click
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    },
    [panOffset],
  );

  // Global mouse move/up for panning
  useEffect(() => {
    if (!isPanning) return;

    document.documentElement.classList.add("is-panning");

    const handleMouseMove = (e: MouseEvent) => {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };
    const handleMouseUp = () => setIsPanning(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.documentElement.classList.remove("is-panning");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning, panStart]);

  // Edit link
  const openEditLinkModal = (link: ServiceLink) => {
    setEditingLink(link);
  };

  const handleEditLinkSave = async (data: UpdateLinkRequest) => {
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
  const openEditNodeModal = (service: Service) => {
    setDrawerInitialTab(undefined);
    setEditingNode(service);
  };

  const handleEditNodeConfirm = async (data: UpdateServiceRequest) => {
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
    <div className="flex-1 relative bg-muted border border-border rounded-[10px] overflow-hidden min-h-[400px]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-card/90 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="text-[0.85rem] text-foreground font-semibold">
            {servicesOnline} / {services.length}
          </span>
          <span className="text-[0.75rem] text-muted-foreground">{t("dashboard.online")}</span>
          {servicesWithUpdates.length > 0 && (
            <>
              <span className="text-border">·</span>
              <UpdatesPopover
                services={servicesWithUpdates}
                onSelect={(s) => {
                  setDrawerInitialTab(DrawerTab.CHANGELOG);
                  setEditingNode(s);
                }}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={() => setAddingService(true)}>
            <Icons.Plus size={14} />
            {t("dashboard.addService")}
          </Button>
          {selectedService && (
            <Button
              variant="outline"
              onClick={() => void handleRemoveFromDashboard(selectedService.id!)}
            >
              <Icons.Trash size={14} />
              {t("services.removeFromDashboard")}
            </Button>
          )}
          <Button variant="outline" title={t("dashboard.refresh")} onClick={() => refresh()}>
            <Icons.Refresh size={14} />
          </Button>
          <Button
            variant="outline"
            title={t("dashboard.triggerStatusChecks")}
            onClick={() => dashboardApi.checkAllServices()}
          >
            <Icons.CheckCircle size={14} />
          </Button>
          <Button
            variant={snapToGrid ? "default" : "outline"}
            size="icon"
            title={t("dashboard.snapToGrid")}
            onClick={() => setSnapToGrid((v) => !v)}
          >
            <Icons.Grid size={14} />
          </Button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="w-full h-full relative overflow-hidden canvas-dot-grid"
        style={{ cursor: isPanning ? "grabbing" : "default" }}
        onMouseDown={handleCanvasMouseDown}
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
            resizeDimensions={resizeDimensions}
            hoveredNode={hoveredNode}
            nestingTarget={nestingTarget}
            connectingSource={connectingSource}
            onSelect={handleNodeClick}
            onHover={setHoveredNode}
            onDoubleClick={openEditNodeModal}
            onDragStart={handleDragStart}
            onResizeStart={handleResizeStart}
            onPortMouseDown={handlePortMouseDown}
            onPortMouseEnter={handlePortMouseEnter}
            onPortMouseLeave={handlePortMouseLeave}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
          />
          <LinkLayer
            links={links}
            services={services}
            dragOffsets={dragOffsets}
            resizeDimensions={resizeDimensions}
            connectingSource={connectingSource}
            mouseCanvasPos={mouseCanvasPos}
            onEditLink={openEditLinkModal}
          />
        </div>
      </div>

      <ZoomControls
        zoom={zoomLevel}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onZoomIn={() => setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + 0.25))}
        onZoomOut={() => setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - 0.25))}
        onFit={fitToContent}
      />

      {addingService && (
        <AddServiceModal
          onSave={async (data) => {
            await addService({
              ...data,
              source: ServiceSource.NETWORK,
              checkPort: data.checkPort ?? undefined,
            });
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
          key={editingNode.id}
          service={editingNode}
          initialTab={drawerInitialTab}
          onSave={handleEditNodeConfirm}
          onDelete={handleEditNodeDelete}
          onClose={() => {
            setEditingNode(null);
            setDrawerInitialTab(undefined);
          }}
        />
      )}

      {services.length === 0 && !editingLink && !error && <EmptyOverlay />}

      {error && !loading && <ErrorOverlay message={error} onRetry={refresh} />}
    </div>
  );
}
