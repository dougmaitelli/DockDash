import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service, UpdateServiceRequest } from "@shared";
import { ServiceSource, ServiceStatus } from "@shared";

import { Icons } from "@/components/Icons";
import { PortTag } from "@/components/PortTag";
import type { SortState } from "@/components/Table";
import { FilterHeader, SortHeader } from "@/components/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

import { MiniHealthBar } from "../components/HealthHistoryGraph";
import { AddServiceModal } from "../components/modals/AddServiceModal";
import { ServiceDrawer } from "../components/modals/ServiceDrawer";
import { useServices } from "../hooks/useData";

type SourceFilter = "all" | ServiceSource;
type StatusFilter = "all" | ServiceStatus;
type UpdateFilter = "all" | "hasUpdate";

type SortColumn = "name" | "host";

function statusVariant(status: ServiceStatus): "success" | "destructive" | "secondary" {
  if (status === ServiceStatus.UP) return "success";

  if (status === ServiceStatus.DOWN) return "destructive";

  return "secondary";
}

function compareServices(a: Service, b: Service, column: SortColumn): number {
  switch (column) {
    case "name":
      return a.name.localeCompare(b.name);
    case "host":
      return a.host.localeCompare(b.host);
  }
}

export default function Services() {
  const { t } = useTranslation();
  const {
    services,
    loading,
    error,
    refresh,
    addService,
    updateService,
    removeService,
    addToDashboard,
    removeFromDashboard,
  } = useServices();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>("all");
  const [sort, setSort] = useState<SortState<SortColumn>>({ column: "name", direction: "asc" });
  const [drawerService, setDrawerService] = useState<Service | null>(null);
  const [addingService, setAddingService] = useState(false);

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
    const sign = sort.direction === "asc" ? 1 : -1;

    return [...visible].sort((a, b) => sign * compareServices(a, b, sort.column));
  }, [services, search, sourceFilter, statusFilter, updateFilter, sort]);

  const handleDrawerSave = async (data: UpdateServiceRequest) => {
    if (!drawerService) return;

    await updateService(drawerService.id!, data);
    setDrawerService(null);
    await refresh();
  };

  const handleDrawerDelete = async () => {
    if (!drawerService) return;

    await removeService(drawerService.id!);
    setDrawerService(null);
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
      </div>

      {error && !loading && <p className="text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <FilterHeader
                label={t("services.colSource")}
                width="w-32"
                value={sourceFilter}
                onChange={setSourceFilter}
                filterCycle={[
                  { value: "all" },
                  {
                    value: ServiceSource.DOCKER,
                    title: t("services.filterSourceDocker"),
                  },
                  {
                    value: ServiceSource.NETWORK,
                    title: t("services.filterSourceNetwork"),
                  },
                ]}
              />
              <SortHeader
                col="name"
                label={t("services.colName")}
                value={sort}
                onChange={setSort}
              />
              <SortHeader
                col="host"
                label={t("services.colHost")}
                value={sort}
                onChange={setSort}
              />
              <th className="px-4 py-2.5 font-medium">{t("services.colPorts")}</th>
              <FilterHeader
                label={t("services.colStatus")}
                value={statusFilter}
                onChange={setStatusFilter}
                filterCycle={[
                  { value: "all" },
                  {
                    value: ServiceStatus.UP,
                    activeClass: "text-success hover:text-success/80",
                    dotClass: "bg-success",
                  },
                  {
                    value: ServiceStatus.DOWN,
                    activeClass: "text-destructive hover:text-destructive/80",
                    dotClass: "bg-destructive",
                  },
                  {
                    value: ServiceStatus.UNKNOWN,
                    activeClass: "text-muted-foreground hover:text-secondary-foreground",
                    dotClass: "bg-muted-foreground",
                  },
                ]}
              />
              <FilterHeader
                label={t("services.colVersion")}
                value={updateFilter}
                onChange={setUpdateFilter}
                filterCycle={[
                  { value: "all" },
                  {
                    value: "hasUpdate",
                    title: t("services.filterHasUpdate"),
                  },
                ]}
              />
              <th
                className="px-4 py-2.5 font-medium w-32"
                aria-label={t("services.colDashboard")}
              />
            </tr>
          </thead>
          <tbody>
            {visible.map((service) => {
              const isDocker = service.source === ServiceSource.DOCKER;
              const imageTag = service.metadata?.imageTag;
              const hasUpdate = service.metadata?.hasUpdate;
              const latestVersion = service.metadata?.latestVersion;

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
                    <div className="flex items-center gap-2">
                      <MiniHealthBar serviceId={service.id!} />
                      <Badge variant={statusVariant(service.status)} className="font-normal">
                        {service.status === ServiceStatus.UP
                          ? t("services.statusUp")
                          : service.status === ServiceStatus.DOWN
                            ? t("services.statusDown")
                            : t("services.statusUnknown")}
                      </Badge>
                    </div>
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
                  <td className="px-4 py-3 text-right">
                    {service.onDashboard ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Icons.Check size={12} />
                        {t("services.onDashboard")}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        title={t("services.addToDashboard")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void addToDashboard(service.id!);
                        }}
                      >
                        <Icons.Plus size={12} />
                        {t("services.addToDashboard")}
                      </Button>
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
          key={drawerService.id}
          service={drawerService}
          onSave={handleDrawerSave}
          onDelete={handleDrawerDelete}
          onRemoveFromDashboard={async () => {
            await removeFromDashboard(drawerService.id!);
            setDrawerService(null);
          }}
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
    </div>
  );
}
