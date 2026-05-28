import { useState, useEffect, useCallback } from "react";
import { serviceApi, linkApi, positionApi, discoveryApi, dashboardApi } from "../services/api";
import { DashboardData, Service, ServiceLink, ServiceStatus, DockerHostHealth } from "@shared";

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

  const importService = async (data: Partial<Service> & { name: string; host: string }) => {
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
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, ServiceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await dashboardApi.get();

      setData(res.data);
      const statuses = await dashboardApi.serviceStatuses();
      const statusObj: Record<string, ServiceStatus> = {};

      for (const s of statuses.data) {
        statusObj[s.id] = s.status;
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
        const statusObj: Record<string, ServiceStatus> = {};

        for (const s of res.data) {
          statusObj[s.id] = s.status;
        }

        setServiceStatuses(statusObj);
      } catch {
        // ignore
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const addService = useCallback(
    async (data: Partial<Service> & { name: string; host: string }) => {
      const res = await serviceApi.importService(data);

      setData((prev) => {
        if (!prev) return prev;

        return { ...prev, services: [...prev.services, { ...res.data, position: null }] };
      });

      return res.data;
    },
    [],
  );

  const updateService = useCallback(
    async (id: string, data: Pick<Service, "name" | "host" | "port" | "protocol">) => {
      const res = await serviceApi.update(id, data);

      setData((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          services: prev.services.map((s) => (s.id === id ? { ...s, ...res.data } : s)),
        };
      });
    },
    [],
  );

  const updatePosition = useCallback(
    async (serviceId: string, x: number, y: number, parentId: string | null = null) => {
      await positionApi.save([{ service_id: serviceId, x, y, parent_id: parentId }]);
      setData((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          services: prev.services.map((s) =>
            s.id === serviceId
              ? { ...s, position: { service_id: serviceId, x, y, parent_id: parentId } }
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

  const addLink = useCallback(async (data: Omit<ServiceLink, "id" | "created_at">) => {
    const res = await linkApi.create(data);

    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, links: [...prev.links, res.data] };
    });
  }, []);

  const updateLink = useCallback(
    async (id: string, data: Pick<ServiceLink, "label" | "type" | "description">) => {
      const res = await linkApi.update(id, data);

      setData((prev) => {
        if (!prev) return prev;

        return { ...prev, links: prev.links.map((l) => (l.id === id ? res.data : l)) };
      });
    },
    [],
  );

  const removeLink = useCallback(async (id: string) => {
    await linkApi.delete(id);
    setData((prev) => {
      if (!prev) return prev;

      return { ...prev, links: prev.links.filter((l) => l.id !== id) };
    });
  }, []);

  const servicesWithStatus = (data?.services ?? []).map((s) => ({
    ...s,
    status: (serviceStatuses[s.id!] as ServiceStatus) ?? s.status,
  }));

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
