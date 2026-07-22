import axios, { type AxiosResponse } from "axios";
import type { ZodType } from "zod";

import type { ContainerAction } from "@shared";
import type {
  CreateLinkRequest,
  CreateServiceRequest,
  PositionUpdate,
  SavePositionsRequest,
  TerminalInputRequest,
  UpdateLinkRequest,
  UpdateServiceRequest,
} from "@shared/requestSchemas.js";
import {
  apiSuccessResponseSchema,
  appUpdateResponseSchema,
  authLogoutResponseSchema,
  authStateResponseSchema,
  changelogResponseSchema,
  checkAllServicesResponseSchema,
  containerStatsResponseSchema,
  dashboardConfigResponseSchema,
  dashboardDataResponseSchema,
  dockerHostHealthResponseSchema,
  fileContentResponseSchema,
  filesResponseSchema,
  healthHistoryResponseSchema,
  resourceHistoryResponseSchema,
  savePositionsResponseSchema,
  serviceLinkResponseSchema,
  serviceResponseSchema,
  serviceStatusResponseSchema,
} from "@shared/responseSchemas.js";

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

async function validated<T>(
  request: Promise<AxiosResponse<unknown>>,
  schema: ZodType<T>,
): Promise<AxiosResponse<T>> {
  const response = await request;

  return { ...response, data: schema.parse(response.data) };
}

// Discovery APIs
export const discoveryApi = {
  dockerHealth: () => validated(api.get("/docker/health"), dockerHostHealthResponseSchema),
  testNotification: () => validated(api.post("/notifications/test"), apiSuccessResponseSchema),
  checkAppUpdate: () => validated(api.get("/app-update"), appUpdateResponseSchema),
};

export const configApi = {
  get: () => validated(api.get("/config"), dashboardConfigResponseSchema),
};

export const authApi = {
  getState: () => validated(axios.get("/auth/me"), authStateResponseSchema),
  logout: () => validated(axios.post("/auth/logout"), authLogoutResponseSchema),
};

// Service management APIs
export const serviceApi = {
  getAll: () => validated(api.get("/services"), serviceResponseSchema.array()),
  getById: (id: string) => validated(api.get(`/services/${id}`), serviceResponseSchema),
  importService: (data: CreateServiceRequest) =>
    validated(api.post("/services", data), serviceResponseSchema),
  update: (id: string, data: UpdateServiceRequest) =>
    validated(api.put(`/services/${id}`, data), serviceResponseSchema),
  delete: (id: string) => validated(api.delete(`/services/${id}`), apiSuccessResponseSchema),
  getHealthHistory: (id: string, days: number, buckets = 80) =>
    validated(
      api.get(`/services/${id}/health-history`, { params: { days, buckets } }),
      healthHistoryResponseSchema,
    ),
  getResourceHistory: (id: string, days: number, buckets = 80) =>
    validated(
      api.get(`/services/${id}/resource-history`, { params: { days, buckets } }),
      resourceHistoryResponseSchema,
    ),
  getChangelog: (id: string) =>
    validated(api.get(`/services/${id}/changelog`), changelogResponseSchema),
  addToDashboard: (id: string) =>
    validated(api.post(`/services/${id}/dashboard`), apiSuccessResponseSchema),
  removeFromDashboard: (id: string) =>
    validated(api.delete(`/services/${id}/dashboard`), apiSuccessResponseSchema),
  containerAction: (id: string, action: ContainerAction) =>
    validated(api.post(`/services/${id}/container/${action}`), apiSuccessResponseSchema),
  listFiles: (id: string, path: string) =>
    validated(api.get(`/services/${id}/files`, { params: { path } }), filesResponseSchema),
  readFileContent: (id: string, path: string) =>
    validated(
      api.get(`/services/${id}/files/content`, { params: { path } }),
      fileContentResponseSchema,
    ),
  writeFileContent: (id: string, path: string, content: string) =>
    validated(
      api.put(`/services/${id}/files/content`, { path, content }),
      apiSuccessResponseSchema,
    ),
  writeTerminalInput: (id: string, data: TerminalInputRequest) =>
    validated(api.post(`/services/${id}/terminal/input`, data), apiSuccessResponseSchema),
  getStats: (id: string) =>
    validated(api.get(`/services/${id}/stats`), containerStatsResponseSchema),
};

// Link management APIs
export const linkApi = {
  create: (data: CreateLinkRequest) =>
    validated(api.post("/links", data), serviceLinkResponseSchema),
  update: (id: string, data: UpdateLinkRequest) =>
    validated(api.put(`/links/${id}`, data), serviceLinkResponseSchema),
  delete: (id: string) => validated(api.delete(`/links/${id}`), apiSuccessResponseSchema),
};

// Position management APIs
export const positionApi = {
  save: (positions: PositionUpdate[]) =>
    validated(
      api.post("/positions", { positions } satisfies SavePositionsRequest),
      savePositionsResponseSchema,
    ),
};

// Dashboard API
export const dashboardApi = {
  get: () => validated(api.get("/dashboard"), dashboardDataResponseSchema),
  checkAllServices: () => validated(api.post("/checkAllServices"), checkAllServicesResponseSchema),
  serviceStatuses: () =>
    validated(api.get("/serviceStatuses"), serviceStatusResponseSchema.array()),
};

export default api;
