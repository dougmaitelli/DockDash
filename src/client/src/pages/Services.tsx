import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service, UpdateServiceRequest } from "@shared";
import { ServiceSource, ServiceStatus } from "@shared";

import { Icons } from "@/components/Icons";
import { PortTag } from "@/components/PortTag";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { cn } from "@/lib/utils";

import { AddServiceModal } from "../components/modals/AddServiceModal";
import { ConfirmDialog } from "../components/modals/ConfirmDialog";
import { ServiceDrawer } from "../components/modals/ServiceDrawer";
import { useServices } from "../hooks/useData";

type SourceFilter = "all" | ServiceSource;
type StatusFilter = "all" | ServiceStatus;
type UpdateFilter = "all" | "hasUpdate";

type SortColumn = "source" | "name" | "host" | "status";
type SortDirection = "asc" | "desc";

function statusVariant(status: ServiceStatus): "success" | "destructive" | "secondary" {
  if (status === ServiceStatus.UP) return "success";

  if (status === ServiceStatus.DOWN) return "destructive";

  return "secondary";
}

// Up first, then Unknown, then Down — keeps "healthy" at the top of an asc sort
const STATUS_SORT_ORDER: Record<ServiceStatus, number> = {
  [ServiceStatus.UP]: 0,
  [ServiceStatus.UNKNOWN]: 1,
  [ServiceStatus.DOWN]: 2,
};

function SortHeader({
  col,
  label,
  width,
  active,
  direction,
  onToggle,
}: {
  col: SortColumn;
  label: string;
  width?: string;
  active: SortColumn;
  direction: SortDirection;
  onToggle: (col: SortColumn) => void;
}) {
  const isActive = active === col;

  return (
    <th
      className={cn(
        "px-4 py-2.5 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
        width,
      )}
      onClick={() => onToggle(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={cn("text-[0.65rem]", isActive ? "opacity-100" : "opacity-30")}>
          {isActive ? (direction === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </span>
    </th>
  );
}

function compareServices(a: Service, b: Service, column: SortColumn): number {
  switch (column) {
    case "source":
      return a.source.localeCompare(b.source);
    case "name":
      return a.name.localeCompare(b.name);
    case "host":
      return a.host.localeCompare(b.host);
    case "status":
      return STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
  }
}

export default function Services() {
  const { t } = useTranslation();
  const { services, loading, error, refresh, addService, updateService, removeService } =
    useServices();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [drawerService, setDrawerService] = useState<Service | null>(null);
  const [addingService, setAddingService] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = services.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;

      if (statusFilter !== "all" && s.status !== statusFilter) return false;

      if (updateFilter === "hasUpdate" && !s.metadata?.hasUpdate) return false;

      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.host.toLowerCase().includes(q) &&
        !s.ports.some((p) => String(p).includes(q))
      ) {
        return false;
      }

      return true;
    });
    const sign = sortDirection === "asc" ? 1 : -1;

    return [...visible].sort((a, b) => sign * compareServices(a, b, sortColumn));
  }, [services, search, sourceFilter, statusFilter, updateFilter, sortColumn, sortDirection]);

  const handleDrawerSave = async (data: UpdateServiceRequest) => {
    if (!drawerService) return;

    await updateService(drawerService.id!, data);
    setDrawerService(null);
    await refresh();
  };

  const handleDrawerDelete = () => {
    if (!drawerService) return;

    setPendingDeleteId(drawerService.id!);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-foreground">
          {t("services.title")}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {t("services.count", { count: visible.length })}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" title={t("dashboard.refresh")} onClick={() => refresh()}>
            <Icons.Refresh size={14} />
          </Button>
          <Button variant="outline" onClick={() => setAddingService(true)}>
            <Icons.Plus size={14} />
            {t("dashboard.addService")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("services.searchPlaceholder")}
          className="w-64"
        />
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("services.filterSource")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("services.filterAll")}</SelectItem>
            <SelectItem value={ServiceSource.DOCKER}>{t("services.sourceDocker")}</SelectItem>
            <SelectItem value={ServiceSource.NETWORK}>{t("services.sourceNetwork")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("services.filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("services.filterAll")}</SelectItem>
            <SelectItem value={ServiceStatus.UP}>{t("services.statusUp")}</SelectItem>
            <SelectItem value={ServiceStatus.DOWN}>{t("services.statusDown")}</SelectItem>
            <SelectItem value={ServiceStatus.UNKNOWN}>{t("services.statusUnknown")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={updateFilter} onValueChange={(v) => setUpdateFilter(v as UpdateFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("services.filterUpdates")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("services.filterAll")}</SelectItem>
            <SelectItem value="hasUpdate">{t("services.filterHasUpdate")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && !loading && <p className="text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <SortHeader
                col="source"
                label={t("services.colSource")}
                width="w-32"
                active={sortColumn}
                direction={sortDirection}
                onToggle={toggleSort}
              />
              <SortHeader
                col="name"
                label={t("services.colName")}
                active={sortColumn}
                direction={sortDirection}
                onToggle={toggleSort}
              />
              <SortHeader
                col="host"
                label={t("services.colHost")}
                active={sortColumn}
                direction={sortDirection}
                onToggle={toggleSort}
              />
              <th className="px-4 py-2.5 font-medium">{t("services.colPorts")}</th>
              <SortHeader
                col="status"
                label={t("services.colStatus")}
                width="w-28"
                active={sortColumn}
                direction={sortDirection}
                onToggle={toggleSort}
              />
              <th className="px-4 py-2.5 font-medium">{t("services.colVersion")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((service) => {
              const isDocker = service.source === ServiceSource.DOCKER;
              const imageTag = service.metadata?.imageTag as string | undefined;
              const hasUpdate = service.metadata?.hasUpdate as boolean | undefined;
              const latestVersion = service.metadata?.latestVersion as string | undefined;

              return (
                <tr
                  key={service.id}
                  onClick={() => setDrawerService(service)}
                  className={cn(
                    "border-b border-border last:border-b-0 cursor-pointer transition-colors",
                    "hover:bg-primary/5",
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-[6px] py-px rounded text-[0.65rem] bg-warning/10 text-warning">
                      {isDocker ? <Icons.Docker size={12} /> : <Icons.Globe size={12} />}
                      {isDocker ? t("services.sourceDocker") : t("services.sourceNetwork")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{service.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary-foreground">
                    {service.host}
                  </td>
                  <td className="px-4 py-3">
                    {service.ports.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {service.ports.map((p) => (
                          <PortTag key={p}>:{p}</PortTag>
                        ))}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(service.status)} className="font-normal">
                      {service.status === ServiceStatus.UP
                        ? t("services.statusUp")
                        : service.status === ServiceStatus.DOWN
                          ? t("services.statusDown")
                          : t("services.statusUnknown")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {imageTag ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="inline-block px-1.5 py-px bg-accent-purple/10 text-accent-purple rounded text-[0.65rem] font-mono">
                          {imageTag}
                        </span>
                        {hasUpdate && (
                          <>
                            <Icons.ArrowRight size={10} className="text-muted-foreground" />
                            <span className="inline-block px-1.5 py-px bg-warning/10 text-warning border border-warning/30 rounded text-[0.65rem] font-mono">
                              {latestVersion ?? t("services.updateBadge")}
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && visible.length === 0 && services.length > 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("services.noResults")}
          </div>
        )}

        {!loading && services.length === 0 && !error && (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-foreground">{t("services.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("services.emptyMessage")}</p>
          </div>
        )}
      </Card>

      {drawerService && (
        <ServiceDrawer
          service={drawerService}
          onSave={handleDrawerSave}
          onDelete={handleDrawerDelete}
          onClose={() => setDrawerService(null)}
        />
      )}

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

      {pendingDeleteId && (
        <ConfirmDialog
          message={t("modals.confirmDeleteService")}
          onConfirm={async () => {
            await removeService(pendingDeleteId);
            setPendingDeleteId(null);
            setDrawerService(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
