import axios from "axios";
import type {
  Service,
  ServiceLink,
  ServicePosition,
  DashboardData,
  ServiceStatusItem,
} from "@shared";
import { DashboardConfig, DockerHealth } from "@/types";

const api = axios.create({
  baseURL: "/api",
});

// Discovery APIs
export const discoveryApi = {
  dockerHealth: () => api.get<DockerHealth>("/docker/health"),
  dockerNetworks: () => api.get("/docker/networks"),
  getConfig: () => api.get<DashboardConfig>("/config"),
};

// Service management APIs
export const serviceApi = {
  getAll: () => api.get<Service[]>("/services"),
  getById: (id: string) => api.get<Service>(`/services/${id}`),
  importService: (data: Partial<Service> & { name: string; host: string; id?: string }) =>
    api.post<Service>("/services", data),
  update: (
    id: string,
    data: { name: string; host: string; port?: number | null; protocol?: string },
  ) => api.put<Service>(`/services/${id}`, data),
  delete: (id: string) => api.delete(`/services/${id}`),
};

// Link management APIs
export const linkApi = {
  create: (data: Omit<ServiceLink, "id" | "created_at">) => api.post<ServiceLink>("/links", data),
  update: (id: string, data: Pick<ServiceLink, "label" | "type" | "description">) =>
    api.put<ServiceLink>(`/links/${id}`, data),
  delete: (id: string) => api.delete(`/links/${id}`),
};

// Position management APIs
export const positionApi = {
  save: (positions: { service_id: string; x: number; y: number; parent_id?: string | null }[]) =>
    api.post<SavePositionsResponse>("/positions", { positions }),
};

// Dashboard API
export const dashboardApi = {
  get: () => api.get<DashboardData>("/dashboard"),
  checkAllServices: () => api.post("/checkAllServices"),
  serviceStatuses: () => api.get<ServiceStatusItem[]>("/serviceStatuses"),
};

// Position API response with saved positions
export interface SavePositionsResponse {
  positions: ServicePosition[];
}

export default api;
