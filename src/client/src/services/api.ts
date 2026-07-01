import axios from "axios";

import type {
  ApiSuccess,
  ChangelogResponse,
  CheckAllServicesResponse,
  ContainerAction,
  CreateLinkRequest,
  CreateServiceRequest,
  DashboardData,
  DockerHostHealth,
  FileContentResponse,
  FilesResponse,
  HealthBucket,
  PositionUpdate,
  SavePositionsRequest,
  SavePositionsResponse,
  Service,
  ServiceLink,
  ServiceStatusItem,
  TerminalInputRequest,
  UpdateLinkRequest,
  UpdateServiceRequest,
} from "@shared";
import type { AppUpdateInfo } from "@shared/api";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }

    return Promise.reject(err);
  },
);

// Discovery APIs
export const discoveryApi = {
  dockerHealth: () => api.get<DockerHostHealth[]>("/docker/health"),
  testNotification: () => api.post<ApiSuccess>("/notifications/test"),
  checkAppUpdate: () => api.get<AppUpdateInfo>("/app-update"),
};

// Service management APIs
export const serviceApi = {
  getAll: () => api.get<Service[]>("/services"),
  getById: (id: string) => api.get<Service>(`/services/${id}`),
  importService: (data: CreateServiceRequest) => api.post<Service>("/services", data),
  update: (id: string, data: UpdateServiceRequest) => api.put<Service>(`/services/${id}`, data),
  delete: (id: string) => api.delete<ApiSuccess>(`/services/${id}`),
  getHealthHistory: (id: string, days: number, buckets = 80) =>
    api.get<HealthBucket[]>(`/services/${id}/health-history`, { params: { days, buckets } }),
  getChangelog: (id: string) => api.get<ChangelogResponse>(`/services/${id}/changelog`),
  addToDashboard: (id: string) => api.post<ApiSuccess>(`/services/${id}/dashboard`),
  removeFromDashboard: (id: string) => api.delete<ApiSuccess>(`/services/${id}/dashboard`),
  containerAction: (id: string, action: ContainerAction) =>
    api.post<ApiSuccess>(`/services/${id}/container/${action}`),
  listFiles: (id: string, path: string) =>
    api.get<FilesResponse>(`/services/${id}/files`, { params: { path } }),
  readFileContent: (id: string, path: string) =>
    api.get<FileContentResponse>(`/services/${id}/files/content`, { params: { path } }),
  writeFileContent: (id: string, path: string, content: string) =>
    api.put<ApiSuccess>(`/services/${id}/files/content`, { path, content }),
  writeTerminalInput: (id: string, data: TerminalInputRequest) =>
    api.post<ApiSuccess>(`/services/${id}/terminal/input`, data),
};

// Link management APIs
export const linkApi = {
  create: (data: CreateLinkRequest) => api.post<ServiceLink>("/links", data),
  update: (id: string, data: UpdateLinkRequest) => api.put<ServiceLink>(`/links/${id}`, data),
  delete: (id: string) => api.delete<ApiSuccess>(`/links/${id}`),
};

// Position management APIs
export const positionApi = {
  save: (positions: PositionUpdate[]) =>
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
