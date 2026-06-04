import { useState, useEffect, useCallback } from "react";
import { serviceApi, linkApi, positionApi, discoveryApi, dashboardApi } from "../services/api";
import {
  DashboardData,
  Service,
  ServiceStatusItem,
  DockerHostHealth,
  CreateServiceRequest,
  UpdateServiceRequest,
  CreateLinkRequest,
  UpdateLinkRequest,
} from "@shared";

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

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, ServiceStatusItem>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await dashboardApi.get();

      setData(res.data);
      const statuses = await dashboardApi.serviceStatuses();
      const statusObj: Record<string, ServiceStatusItem> = {};

      for (const s of statuses.data) {
        statusObj[s.id] = s;
      }

      setServiceStatuses(statusObj);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await dashboardApi.serviceStatuses();
        const statusObj: Record<string, ServiceStatusItem> = {};

        for (const s of res.data) {
          statusObj[s.id] = s;
        }

        setServiceStatuses(statusObj);
      } catch {
        // ignore
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const addService = useCallback(async (data: CreateServiceRequest) => {
    const res = await serviceApi.importService(data);

    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, services: [...prev.services, { ...res.data, position: null }] };
    });

    return res.data;
  }, []);

  const updateService = useCallback(async (id: string, data: UpdateServiceRequest) => {
    const res = await serviceApi.update(id, data);

    setData((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        services: prev.services.map((s) => (s.id === id ? { ...s, ...res.data } : s)),
      };
    });
  }, []);

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
      setData((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          services: prev.services.map((s) =>
            s.id === serviceId
              ? { ...s, position: { serviceId, x, y, parentId: parentId ?? undefined, w: w ?? undefined, h: h ?? undefined } }
              : s,
          ),
        };
      });
    },
    [],
  );

  const removeService = useCallback(async (id: string) => {
    await serviceApi.delete(id);
    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, services: prev.services.filter((s) => s.id !== id) };
    });
  }, []);

  const addLink = useCallback(async (data: CreateLinkRequest) => {
    const res = await linkApi.create(data);

    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, links: [...prev.links, res.data] };
    });
  }, []);

  const updateLink = useCallback(async (id: string, data: UpdateLinkRequest) => {
    const res = await linkApi.update(id, data);

    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, links: prev.links.map((l) => (l.id === id ? res.data : l)) };
    });
  }, []);

  const removeLink = useCallback(async (id: string) => {
    await linkApi.delete(id);
    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, links: prev.links.filter((l) => l.id !== id) };
    });
  }, []);

  const servicesWithStatus = (data?.services ?? []).map((s) => {
    const item = serviceStatuses[s.id!];

    if (!item) return s;

    const { id: _id, ...updates } = item;

    return { ...s, ...updates, metadata: { ...s.metadata, ...updates.metadata } };
  });

  return {
    services: servicesWithStatus,
    links: data?.links ?? [],
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
  };
}
