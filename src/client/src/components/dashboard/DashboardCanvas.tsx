import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Connection,
  ConnectionLineType,
  Controls,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import type { Service, ServiceLink, ServicePosition, ServiceWithPosition } from "@shared";
import { ServiceLinkType, ServiceSource, ServiceStatus } from "@shared";
import type {
  CreateLinkRequest,
  CreateServiceRequest,
  UpdateLinkRequest,
  UpdateServiceRequest,
} from "@shared/requestSchemas.js";

import { Icons } from "@/components/Icons";
import { PortTag } from "@/components/PortTag";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { LINK_TYPES } from "@/types";

import { dashboardApi } from "../../services/api";
import { AddServiceModal } from "../modals/AddServiceModal";
import { EditLinkModal } from "../modals/EditLinkModal";
import { ServiceDrawer, Tab as DrawerTab } from "../modals/ServiceDrawer";
import { EmptyOverlay } from "./EmptyOverlay";
import { ErrorOverlay } from "./ErrorOverlay";
import { UpdatesPopover } from "./UpdatesPopover";

import "@xyflow/react/dist/style.css";
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

type ServiceFlowData = {
  service: ServiceWithPosition;
  isContainer: boolean;
  minContainerWidth: number;
  minContainerHeight: number;
  targetPorts: number[];
  onOpen: (service: ServiceWithPosition) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
};

type ServiceFlowNode = Node<ServiceFlowData, "service">;

type ServiceEdgeData = { link: ServiceLink };
type ServiceFlowEdge = Edge<ServiceEdgeData, "serviceLink">;

const PARENT_HEADER_HEIGHT = 112;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;
const DEFAULT_CONTAINER_WIDTH = 400;
const DEFAULT_CONTAINER_HEIGHT = 280;

function getLinkColor(type: string): string {
  return LINK_TYPES.find((candidate) => candidate.value === type)?.color || "var(--accent-gray)";
}

function ServiceLinkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<ServiceFlowEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const portOffset = 22;
  const portX =
    targetX +
    (targetPosition === Position.Left
      ? -portOffset
      : targetPosition === Position.Right
        ? portOffset
        : 0);
  const portY =
    targetY +
    (targetPosition === Position.Top
      ? -portOffset
      : targetPosition === Position.Bottom
        ? portOffset
        : 0);

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {data?.link.label && (
          <span
            className="flow-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.link.label}
          </span>
        )}
        {data?.link.targetPort != null && (
          <span
            className="flow-edge-port nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${portX}px, ${portY}px)` }}
          >
            :{data.link.targetPort}
          </span>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

function ServiceFlowNode({ id, data, selected }: NodeProps<ServiceFlowNode>) {
  const {
    service,
    isContainer,
    minContainerWidth,
    minContainerHeight,
    targetPorts,
    onOpen,
    onResizeEnd,
  } = data;
  const statusClass =
    service.status === ServiceStatus.UP
      ? "bg-success/15 text-success"
      : service.status === ServiceStatus.DOWN
        ? "bg-destructive/15 text-destructive"
        : "bg-muted-foreground/15 text-muted-foreground";

  return (
    <div
      className={cn(
        "flow-service-node",
        isContainer && "flow-service-node--container",
        selected && "flow-service-node--selected",
      )}
      onDoubleClick={() => onOpen(service)}
    >
      {isContainer && (
        <NodeResizer
          minWidth={minContainerWidth}
          minHeight={minContainerHeight}
          isVisible={selected}
          onResizeEnd={(_event, params) => onResizeEnd(id, params.width, params.height)}
        />
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="flow-passive-handle"
      />
      <Handle type="source" position={Position.Right} id="source-right" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="flow-passive-handle"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="flow-passive-handle"
      />
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="flow-passive-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="flow-external-bottom-handle"
      />
      {targetPorts.flatMap((port, index) =>
        ([Position.Left, Position.Right, Position.Top, Position.Bottom] as const).map((side) => (
          <Handle
            key={`${port}-${side}`}
            type="target"
            position={side}
            id={`target-port-${port}-${side}`}
            className="flow-passive-handle"
            style={
              side === Position.Left || side === Position.Right
                ? { top: `${((index + 1) / (targetPorts.length + 1)) * 100}%` }
                : { left: `${((index + 1) / (targetPorts.length + 1)) * 100}%` }
            }
          />
        )),
      )}
      {isContainer && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="source-internal"
            className="flow-internal-handle"
          />
          <Handle
            type="target"
            position={Position.Bottom}
            id="target-internal"
            className="flow-internal-handle"
          />
        </>
      )}

      <div className="flow-service-node__header">
        <div className="text-[0.85rem] font-semibold text-foreground flex items-center gap-1.5 overflow-hidden">
          {service.source === ServiceSource.DOCKER ? (
            <Icons.Docker size={14} className="text-muted-foreground" />
          ) : (
            <Icons.Globe size={14} className="text-muted-foreground" />
          )}
          <span className="truncate" title={service.name}>
            {service.name}
          </span>
        </div>

        {service.source === ServiceSource.DOCKER && service.metadata?.imageTag && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <span className="px-[5px] py-px bg-accent-purple/10 text-accent-purple rounded text-[0.6rem] font-mono">
              {service.metadata.imageTag}
            </span>
            {service.metadata.hasUpdate && (
              <span className="px-[5px] py-px bg-warning/10 text-warning border border-warning/30 rounded text-[0.6rem] font-mono">
                {service.metadata.latestVersion ?? "update available"}
              </span>
            )}
          </div>
        )}

        <div className="text-[0.7rem] text-muted-foreground mt-1 font-mono flex flex-wrap gap-1">
          {service.host}
          {service.ports?.map((port) => (
            <PortTag key={port}>:{port}</PortTag>
          ))}
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold mt-2 uppercase",
            statusClass,
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {service.status}
        </div>
        {isContainer && (
          <div className="flow-service-node__container-label">Contained services</div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { service: ServiceFlowNode };
const edgeTypes = { serviceLink: ServiceLinkEdge };

function toFlowEdges(links: ServiceLink[], services: ServiceWithPosition[]): ServiceFlowEdge[] {
  const renderedPortLabels = new Set<string>();
  const absolutePosition = (serviceId: string): { x: number; y: number } => {
    const service = services.find((candidate) => candidate.id === serviceId);

    if (!service?.position) return { x: 0, y: 0 };

    if (!service.position.parentId) return service.position;

    const parent = absolutePosition(service.position.parentId);

    return {
      x: parent.x + service.position.x,
      y: parent.y + PARENT_HEADER_HEIGHT + service.position.y,
    };
  };

  return links.map((link) => {
    const portGroup = `${link.targetId}:${link.targetPort}`;
    const showPortLabel = link.targetPort != null && !renderedPortLabels.has(portGroup);

    if (showPortLabel) renderedPortLabels.add(portGroup);

    const sourcePosition = absolutePosition(link.sourceId);
    const targetPosition = absolutePosition(link.targetId);
    const sourceIsParent =
      services.find((service) => service.id === link.targetId)?.position?.parentId ===
      link.sourceId;
    const targetIsParent =
      services.find((service) => service.id === link.sourceId)?.position?.parentId ===
      link.targetId;
    const verticalDirection = targetPosition.y - sourcePosition.y;
    const horizontalDirection = targetPosition.x - sourcePosition.x;
    const sourceService = services.find((service) => service.id === link.sourceId);
    const targetService = services.find((service) => service.id === link.targetId);
    const sourceHeight = sourceService?.position?.h ?? NODE_HEIGHT;
    const targetHeight = targetService?.position?.h ?? NODE_HEIGHT;
    const sourceWidth = sourceService?.position?.w ?? NODE_WIDTH;
    const targetWidth = targetService?.position?.w ?? NODE_WIDTH;
    const overlapsVertically =
      sourcePosition.y <= targetPosition.y + targetHeight &&
      targetPosition.y <= sourcePosition.y + sourceHeight;
    const overlapsHorizontally =
      sourcePosition.x <= targetPosition.x + targetWidth &&
      targetPosition.x <= sourcePosition.x + sourceWidth;
    const useVerticalHandles = !overlapsVertically && overlapsHorizontally;
    const sourceSide = useVerticalHandles
      ? verticalDirection > 0
        ? Position.Bottom
        : Position.Top
      : horizontalDirection > 0
        ? Position.Right
        : Position.Left;
    const targetSide = useVerticalHandles
      ? verticalDirection > 0
        ? Position.Top
        : Position.Bottom
      : horizontalDirection > 0
        ? Position.Left
        : Position.Right;
    const sourceHandle = sourceIsParent
      ? "source-internal"
      : targetIsParent
        ? "source-top"
        : `source-${sourceSide}`;
    const targetHandle = sourceIsParent
      ? "target-top"
      : targetIsParent
        ? "target-internal"
        : link.targetPort != null
          ? `target-port-${link.targetPort}-${targetSide}`
          : `target-${targetSide}`;

    return {
      id: link.id,
      source: link.sourceId,
      target: link.targetId,
      sourceHandle,
      targetHandle,
      type: "serviceLink",
      markerEnd: { type: MarkerType.ArrowClosed, color: getLinkColor(link.type) },
      style: { stroke: getLinkColor(link.type), strokeWidth: 2 },
      data: {
        link: showPortLabel ? link : { ...link, targetPort: undefined },
      },
    };
  });
}

function DashboardFlow(props: DashboardCanvasProps) {
  const {
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
  } = props;
  const { t } = useTranslation();
  const [addingService, setAddingService] = useState(false);
  const [editingLink, setEditingLink] = useState<ServiceLink | null>(null);
  const [editingNode, setEditingNode] = useState<Service | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab | undefined>();
  const [snapToGrid, setSnapToGrid] = useState(
    () => localStorage.getItem("dockdash.snapToGrid") !== "false",
  );
  const nodesInitialized = useNodesInitialized();
  const { fitView, getIntersectingNodes, getNodesBounds, isNodeIntersecting } = useReactFlow<
    ServiceFlowNode,
    ServiceFlowEdge
  >();
  const initialFitDone = useRef(false);

  const handleResizeEnd = useCallback(
    (id: string, width: number, height: number) => {
      const service = services.find((item) => item.id === id);

      if (!service) return;

      const position: ServicePosition = service.position ?? { serviceId: id, x: 0, y: 0 };

      void updatePosition(id, position.x, position.y, position.parentId ?? null, width, height);
    },
    [services, updatePosition],
  );

  const openNode = useCallback((service: ServiceWithPosition) => {
    setDrawerInitialTab(undefined);
    setEditingNode(service);
  }, []);

  const flowNodes = useMemo<ServiceFlowNode[]>(() => {
    const childCounts = new Map<string, number>();

    services.forEach((service) => {
      if (service.position?.parentId)
        childCounts.set(
          service.position.parentId,
          (childCounts.get(service.position.parentId) ?? 0) + 1,
        );
    });
    const ordered = [...services].sort(
      (a, b) => Number(!!a.position?.parentId) - Number(!!b.position?.parentId),
    );
    const portsByTarget = new Map<string, Set<number>>();

    links.forEach((link) => {
      if (link.targetPort == null) return;

      const ports = portsByTarget.get(link.targetId) ?? new Set<number>();

      ports.add(link.targetPort);
      portsByTarget.set(link.targetId, ports);
    });

    return ordered.map((service, index) => {
      const isContainer = childCounts.has(service.id!);
      const cols = Math.max(3, Math.ceil(Math.sqrt(services.length)));
      const position: ServicePosition = service.position ?? {
        serviceId: service.id!,
        x: 80 + (index % cols) * (NODE_WIDTH + 60),
        y: 80 + Math.floor(index / cols) * (NODE_HEIGHT + 70),
      };
      const children = services.filter((child) => child.position?.parentId === service.id);
      const minContainerWidth = Math.max(
        DEFAULT_CONTAINER_WIDTH,
        ...children.map((child) => (child.position?.x ?? 0) + NODE_WIDTH + 24),
      );
      const minContainerHeight = Math.max(
        DEFAULT_CONTAINER_HEIGHT,
        ...children.map(
          (child) => PARENT_HEADER_HEIGHT + (child.position?.y ?? 0) + NODE_HEIGHT + 24,
        ),
      );

      return {
        id: service.id!,
        type: "service",
        position: {
          x: position.x,
          y: position.y + (position.parentId ? PARENT_HEADER_HEIGHT : 0),
        },
        parentId: position.parentId,
        width: isContainer ? (position.w ?? DEFAULT_CONTAINER_WIDTH) : NODE_WIDTH,
        height: isContainer ? (position.h ?? DEFAULT_CONTAINER_HEIGHT) : undefined,
        data: {
          service,
          isContainer,
          minContainerWidth,
          minContainerHeight,
          targetPorts: [...(portsByTarget.get(service.id!) ?? [])].sort((a, b) => a - b),
          onOpen: openNode,
          onResizeEnd: handleResizeEnd,
        },
      } satisfies ServiceFlowNode;
    });
  }, [services, links, openNode, handleResizeEnd]);
  const routedEdges = useMemo(() => toFlowEdges(links, services), [links, services]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceFlowNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(routedEdges);

  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  useEffect(() => setEdges(routedEdges), [routedEdges, setEdges]);
  useEffect(() => {
    if (initialFitDone.current || services.length === 0 || !nodesInitialized) return;

    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
      initialFitDone.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [fitView, nodesInitialized, services.length]);
  useEffect(() => {
    localStorage.setItem("dockdash.snapToGrid", String(snapToGrid));
  }, [snapToGrid]);

  const selectedService = services.find(
    (service) => nodes.find((node) => node.id === service.id)?.selected,
  );
  const servicesOnline = services.filter((service) => service.status === ServiceStatus.UP).length;
  const servicesWithUpdates = allServices.filter((service) => service.metadata?.hasUpdate);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target)
        return;

      if (
        links.some(
          (link) => link.sourceId === connection.source && link.targetId === connection.target,
        )
      )
        return;

      await addLink({
        sourceId: connection.source,
        targetId: connection.target,
        label: "",
        type: ServiceLinkType.COMMUNICATION,
        description: "",
      });
    },
    [addLink, links],
  );

  const onNodeDragStop = useCallback(
    async (_event: MouseEvent | TouchEvent, node: ServiceFlowNode) => {
      const original = services.find((service) => service.id === node.id);
      const parent = node.parentId
        ? nodes.find((candidate) => candidate.id === node.parentId)
        : null;
      const nodeBounds = getNodesBounds([node.id]);
      const nodeCenter = {
        x: nodeBounds.x + nodeBounds.width / 2,
        y: nodeBounds.y + nodeBounds.height / 2,
        width: 1,
        height: 1,
      };
      const remainsInside = parent
        ? isNodeIntersecting(nodeCenter, getNodesBounds([parent.id]), true)
        : false;

      if (parent && !remainsInside) {
        await updatePosition(
          node.id,
          nodeBounds.x,
          nodeBounds.y,
          null,
          original?.position?.w ?? null,
          original?.position?.h ?? null,
        );

        return;
      }

      if (!parent) {
        const draggedHasChildren = nodes.some((candidate) => candidate.parentId === node.id);
        const possibleParents = nodes.filter(
          (candidate) => candidate.id !== node.id && !candidate.parentId,
        );
        const nestTarget = !draggedHasChildren
          ? getIntersectingNodes(nodeCenter, true, possibleParents).at(-1)
          : undefined;

        if (nestTarget) {
          const targetService = services.find((service) => service.id === nestTarget.id);
          const targetBounds = getNodesBounds([nestTarget.id]);
          const targetPosition = targetService?.position ?? {
            x: targetBounds.x,
            y: targetBounds.y,
          };
          const targetWidth = targetService?.position?.w ?? DEFAULT_CONTAINER_WIDTH;
          const targetHeight = targetService?.position?.h ?? DEFAULT_CONTAINER_HEIGHT;

          await updatePosition(
            nestTarget.id,
            targetPosition.x,
            targetPosition.y,
            null,
            targetWidth,
            targetHeight,
          );
          await updatePosition(
            node.id,
            Math.max(0, nodeBounds.x - targetBounds.x),
            Math.max(0, nodeBounds.y - targetBounds.y - PARENT_HEADER_HEIGHT),
            nestTarget.id,
            original?.position?.w ?? null,
            original?.position?.h ?? null,
          );

          return;
        }
      }

      const persistedY = parent
        ? Math.max(0, node.position.y - PARENT_HEADER_HEIGHT)
        : node.position.y;

      await updatePosition(
        node.id,
        node.position.x,
        persistedY,
        node.parentId ?? null,
        original?.position?.w ?? null,
        original?.position?.h ?? null,
      );
    },
    [getIntersectingNodes, getNodesBounds, isNodeIntersecting, nodes, services, updatePosition],
  );

  const handleRemoveFromDashboard = async (id: string) => {
    await removeFromDashboard(id);
    setEditingNode(null);
  };

  return (
    <div className="flex-1 relative bg-muted border border-border rounded-[10px] overflow-hidden min-h-[400px]">
      <div className="flow-dashboard-toolbar">
        <div className="flex items-center gap-2.5">
          <span className="text-[0.85rem] text-foreground font-semibold">
            {servicesOnline} / {services.length}
          </span>
          <span className="text-[0.75rem] text-muted-foreground">{t("dashboard.online")}</span>
          {servicesWithUpdates.length > 0 && (
            <UpdatesPopover
              services={servicesWithUpdates}
              onSelect={(service) => {
                setDrawerInitialTab(DrawerTab.CHANGELOG);
                setEditingNode(service);
              }}
            />
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
            onClick={() => setSnapToGrid((value) => !value)}
          >
            <Icons.Grid size={14} />
          </Button>
        </div>
      </div>

      <div className="flow-dashboard-canvas">
        <ReactFlow<ServiceFlowNode, ServiceFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={(connection) => void onConnect(connection)}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: "var(--primary)", strokeWidth: 2 }}
          onNodeDoubleClick={(_event, node) => openNode(node.data.service)}
          onEdgeDoubleClick={(_event, edge) =>
            setEditingLink(links.find((link) => link.id === edge.id) ?? null)
          }
          onNodesDelete={(deleted) => deleted.forEach((node) => void removeFromDashboard(node.id))}
          snapToGrid={snapToGrid}
          snapGrid={[24, 24]}
          minZoom={0.25}
          maxZoom={3}
          panOnScroll
          selectionOnDrag
          deleteKeyCode={["Delete", "Backspace"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.2}
            color="var(--border-color)"
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) => {
              const data = (node as ServiceFlowNode).data;
              const service = data.service;

              return data.isContainer
                ? "#8b5cf6"
                : service.status === ServiceStatus.UP
                  ? "#22c55e"
                  : service.status === ServiceStatus.DOWN
                    ? "#ef4444"
                    : "#94a3b8";
            }}
            nodeStrokeColor="#0f172a"
            nodeStrokeWidth={2}
            maskColor="rgba(15, 23, 42, 0.62)"
          />
        </ReactFlow>
      </div>

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
          onSave={async (data) => {
            await updateLink(editingLink.id, data);
            setEditingLink(null);
          }}
          onDelete={async () => {
            await removeLink(editingLink.id);
            setEditingLink(null);
          }}
          onCancel={() => setEditingLink(null)}
        />
      )}
      {editingNode && (
        <ServiceDrawer
          service={editingNode}
          initialTab={drawerInitialTab}
          onSave={async (data) => {
            await updateService(editingNode.id!, data);
            setEditingNode(null);
            await refresh();
          }}
          onDelete={async () => {
            await removeService(editingNode.id!);
            setEditingNode(null);
          }}
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

export function DashboardCanvas(props: DashboardCanvasProps) {
  return (
    <ReactFlowProvider>
      <DashboardFlow {...props} />
    </ReactFlowProvider>
  );
}
