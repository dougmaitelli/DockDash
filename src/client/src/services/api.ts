import axios from "axios";
import type {
  Service,
  ServiceLink,
  ServicePosition,
  DashboardData,
  ServiceStatusItem,
  ServiceHealthHistoryItem,
  DockerHostHealth,
  DashboardConfig,
  ApiSuccess,
  SavePositionsRequest,
  SavePositionsResponse,
  CheckAllServicesResponse,
} from "@shared";

const api = axios.create({
  baseURL: "/api",
});

// Discovery APIs
export const discoveryApi = {
  dockerHealth: () => api.get<DockerHostHealth[]>("/docker/health"),
  getConfig: () => api.get<DashboardConfig>("/config"),
  testNotification: () => api.post<ApiSuccess>("/notifications/test"),
};

// Service management APIs
export const serviceApi = {
  getAll: () => api.get<Service[]>("/services"),
  getById: (id: string) => api.get<Service>(`/services/${id}`),
  importService: (data: Partial<Service> & { name: string; host: string; id?: string }) =>
    api.post<Service>("/services", data),
  update: (
    id: string,
    data: { name: string; host: string; ports?: number[]; checkPort?: number | null },
  ) => api.put<Service>(`/services/${id}`, data),
  delete: (id: string) => api.delete<ApiSuccess>(`/services/${id}`),
  getHealthHistory: (id: string, days: number) =>
    api.get<ServiceHealthHistoryItem[]>(`/services/${id}/health-history`, { params: { days } }),
};

// Link management APIs
export const linkApi = {
  create: (data: Omit<ServiceLink, "id" | "createdAt">) => api.post<ServiceLink>("/links", data),
  update: (
    id: string,
    data: Pick<ServiceLink, "label" | "type" | "description" | "targetPort" | "protocol">,
  ) => api.put<ServiceLink>(`/links/${id}`, data),
  delete: (id: string) => api.delete<ApiSuccess>(`/links/${id}`),
};

// Position management APIs
export const positionApi = {
  save: (positions: ServicePosition[]) =>
    api.post<SavePositionsResponse>("/positions", { positions } satisfies SavePositionsRequest),
};

// Dashboard API
export const dashboardApi = {
  get: () => api.get<DashboardData>("/dashboard"),
  checkAllServices: () => api.post<CheckAllServicesResponse>("/checkAllServices"),
  serviceStatuses: () => api.get<ServiceStatusItem[]>("/serviceStatuses"),
};

export type { SavePositionsResponse };

export default api;
