import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CreateLinkRequest,
  CreateServiceRequest,
  DockerHostHealth,
  Service,
  ServiceLink,
  ServicePosition,
  ServiceStatusItem,
  UpdateLinkRequest,
  UpdateServiceRequest,
} from "@shared";

import { dashboardApi, discoveryApi, linkApi, positionApi, serviceApi } from "../services/api";

export function useDiscovery() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await serviceApi.getAll();

      setServices(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const removeService = async (id: string) => {
    await serviceApi.delete(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const importService = async (data: CreateServiceRequest) => {
    const res = await serviceApi.importService(data);

    setServices((prev) => [...prev, res.data]);

    return res.data;
  };

  return {
    services,
    loading,
    error,
    refresh,
    removeService,
    importService,
  };
}

export function useDockerHealth() {
  const [health, setHealth] = useState<DockerHostHealth[] | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      setLoading(true);
      const res = await discoveryApi.dockerHealth();

      setHealth(res.data);
    } catch {
      setHealth([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { health, loading, refresh: check };
}

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStatuses = useCallback(async () => {
    try {
      const res = await dashboardApi.serviceStatuses();
      const statusObj: Record<string, ServiceStatusItem> = {};

      for (const s of res.data) {
        statusObj[s.id] = s;
      }

      setServices((prev) =>
        prev.map((s) => {
          const item = statusObj[s.id!];

          if (!item) return s;

          return {
            ...s,
            status: item.status,
            metadata: { ...s.metadata, ...item.metadata },
            cpuPercent: item.cpuPercent,
            memoryPercent: item.memoryPercent,
          };
        }),
      );
    } catch {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await serviceApi.getAll();

      setServices(res.data);
      void applyStatuses();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [applyStatuses]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => void applyStatuses(), 5000);

    return () => clearInterval(interval);
  }, [applyStatuses]);

  const addService = useCallback(async (data: CreateServiceRequest) => {
    const res = await serviceApi.importService(data);

    setServices((prev) => [...prev, res.data]);

    return res.data;
  }, []);

  const updateService = useCallback(async (id: string, data: UpdateServiceRequest) => {
    const res = await serviceApi.update(id, data);

    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...res.data } : s)));
  }, []);

  const removeService = useCallback(async (id: string) => {
    await serviceApi.delete(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addToDashboard = useCallback(async (id: string) => {
    await serviceApi.addToDashboard(id);
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, onDashboard: true } : s)));
  }, []);

  const removeFromDashboard = useCallback(async (id: string) => {
    await serviceApi.removeFromDashboard(id);
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, onDashboard: false } : s)));
  }, []);

  return {
    services,
    loading,
    error,
    refresh,
    addService,
    updateService,
    removeService,
    addToDashboard,
    removeFromDashboard,
  };
}

export function useDashboard() {
  const base = useServices();
  const [positionsById, setPositionsById] = useState<Record<string, ServicePosition>>({});
  const [links, setLinks] = useState<ServiceLink[]>([]);

  const refreshDashboardExtras = useCallback(async () => {
    const res = await dashboardApi.get();
    const positions: Record<string, ServicePosition> = {};

    for (const s of res.data.services) {
      if (s.position) positions[s.id!] = s.position;
    }

    setPositionsById(positions);
    setLinks(res.data.links);
  }, []);

  useEffect(() => {
    refreshDashboardExtras();
  }, [refreshDashboardExtras]);

  const refresh = useCallback(async () => {
    await Promise.all([base.refresh(), refreshDashboardExtras()]);
  }, [base, refreshDashboardExtras]);

  const updatePosition = useCallback(
    async (
      serviceId: string,
      x: number,
      y: number,
      parentId: string | null = null,
      w?: number | null,
      h?: number | null,
    ) => {
      await positionApi.save([{ serviceId, x, y, parentId, w, h }]);
      setPositionsById((prev) => ({
        ...prev,
        [serviceId]: {
          serviceId,
          x,
          y,
          parentId: parentId ?? undefined,
          w: w ?? undefined,
          h: h ?? undefined,
        },
      }));
    },
    [],
  );

  const addLink = useCallback(async (data: CreateLinkRequest) => {
    const res = await linkApi.create(data);

    setLinks((prev) => [...prev, res.data]);
  }, []);

  const updateLink = useCallback(async (id: string, data: UpdateLinkRequest) => {
    const res = await linkApi.update(id, data);

    setLinks((prev) => prev.map((l) => (l.id === id ? res.data : l)));
  }, []);

  const removeLink = useCallback(async (id: string) => {
    await linkApi.delete(id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const services = useMemo(
    () =>
      base.services
        .filter((s) => s.onDashboard)
        .map((s) => ({ ...s, position: positionsById[s.id!] ?? null })),
    [base.services, positionsById],
  );

  return {
    allServices: base.services,
    services,
    links,
    loading: base.loading,
    error: base.error,
    refresh,
    updatePosition,
    addService: base.addService,
    updateService: base.updateService,
    addLink,
    updateLink,
    removeLink,
    removeService: base.removeService,
    removeFromDashboard: base.removeFromDashboard,
  };
}
