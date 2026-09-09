import { dashboardConfigResponseSchema } from "../../src/shared/responseSchemas.js";

export const IDS = {
  traefik: "11111111-0000-0000-0000-000000000001",
  nginx: "11111111-0000-0000-0000-000000000002",
  postgres: "11111111-0000-0000-0000-000000000003",
  redis: "11111111-0000-0000-0000-000000000004",
  grafana: "11111111-0000-0000-0000-000000000005",
  prometheus: "11111111-0000-0000-0000-000000000006",
} as const;

function makeService(
  id: string,
  name: string,
  host: string,
  ports: number[],
  status: "up" | "down" | "unknown",
  image: string,
  imageTag: string,
  networks: string[],
  labels: string[],
) {
  return {
    id,
    name,
    host,
    ports,
    checkPort: ports[0],
    source: "docker",
    sourceName: "Local",
    status,
    labels,
    onDashboard: true,
    metadata: {
      dockerHostId: "local",
      containerId: id.replace(/-/g, "").slice(0, 12),
      containerName: name,
      networkNames: networks,
      image,
      imageTag,
      hasUpdate: false,
    },
    createdAt: "2024-12-01T00:00:00.000Z",
    updatedAt: "2024-12-20T10:00:00.000Z",
  };
}

export const SERVICES = [
  {
    ...makeService(
      IDS.traefik,
      "traefik",
      "dashboard.example.com",
      [80, 443, 8080],
      "up",
      "traefik",
      "v3.2",
      ["web", "internal"],
      ["Production", "Edge", "Public"],
    ),
    protocol: "https",
    checkPort: 443,
    metadata: {
      dockerHostId: "local",
      containerId: "111111000001",
      containerName: "traefik",
      networkNames: ["web", "internal"],
      image: "traefik",
      imageTag: "v3.2",
      hasUpdate: true,
      latestVersion: "v3.3.0",
      updateCheckedAt: "2024-12-20T10:00:00.000Z",
    },
  },
  {
    ...makeService(
      IDS.nginx,
      "nginx",
      "app.example.com",
      [80, 443],
      "up",
      "nginx",
      "1.27",
      ["web"],
      ["Production", "Frontend", "Public", "Customer-facing"],
    ),
    protocol: "https",
    checkPort: 443,
  },
  makeService(
    IDS.postgres,
    "postgres",
    "172.17.0.12",
    [5432],
    "up",
    "postgres",
    "17",
    ["internal"],
    ["Production", "Database", "Internal"],
  ),
  makeService(
    IDS.redis,
    "redis",
    "172.17.0.13",
    [6379],
    "up",
    "redis",
    "7",
    ["internal"],
    ["Production", "Cache", "Internal"],
  ),
  {
    ...makeService(
      IDS.grafana,
      "grafana",
      "172.17.0.14",
      [3000],
      "up",
      "grafana/grafana",
      "11.4.0",
      ["monitoring", "web"],
      ["Monitoring", "Internal"],
    ),
    metadata: {
      dockerHostId: "local",
      containerId: "111111000005",
      containerName: "grafana",
      networkNames: ["monitoring", "web"],
      image: "grafana/grafana",
      imageTag: "11.4.0",
      hasUpdate: true,
      latestVersion: "11.5.0",
      updateCheckedAt: "2024-12-20T10:00:00.000Z",
    },
  },
  makeService(
    IDS.prometheus,
    "prometheus",
    "172.17.0.15",
    [9090],
    "up",
    "prom/prometheus",
    "v2.55.1",
    ["monitoring"],
    ["Monitoring", "Metrics", "Internal"],
  ),
];

export const RESOURCE_USAGE: Record<string, { cpuPercent: number; memoryPercent: number }> = {
  [IDS.traefik]: { cpuPercent: 12.4, memoryPercent: 22.8 },
  [IDS.nginx]: { cpuPercent: 18.7, memoryPercent: 12.3 },
  [IDS.postgres]: { cpuPercent: 31.2, memoryPercent: 48.6 },
  [IDS.redis]: { cpuPercent: 8.5, memoryPercent: 18.4 },
  [IDS.grafana]: { cpuPercent: 24.3, memoryPercent: 35.7 },
  [IDS.prometheus]: { cpuPercent: 36.8, memoryPercent: 42.1 },
};

export const POSITIONS = [
  { serviceId: IDS.traefik, x: 420, y: 80 },
  { serviceId: IDS.nginx, x: 140, y: 300 },
  { serviceId: IDS.postgres, x: 100, y: 520 },
  { serviceId: IDS.redis, x: 380, y: 520 },
  { serviceId: IDS.grafana, x: 720, y: 300 },
  { serviceId: IDS.prometheus, x: 720, y: 520 },
];

export const DASHBOARD = {
  services: SERVICES.map((s, i) => ({ ...s, position: POSITIONS[i] })),
  links: [
    {
      id: "link-1",
      sourceId: IDS.traefik,
      targetId: IDS.nginx,
      type: "dependency",
      label: "",
      description: "",
      sourceName: "traefik",
      targetName: "nginx",
    },
    {
      id: "link-2",
      sourceId: IDS.traefik,
      targetId: IDS.grafana,
      type: "dependency",
      label: "",
      description: "",
      sourceName: "traefik",
      targetName: "grafana",
    },
    {
      id: "link-3",
      sourceId: IDS.nginx,
      targetId: IDS.postgres,
      type: "dependency",
      label: "db",
      description: "",
      sourceName: "nginx",
      targetName: "postgres",
    },
    {
      id: "link-4",
      sourceId: IDS.nginx,
      targetId: IDS.redis,
      type: "dependency",
      label: "cache",
      description: "",
      sourceName: "nginx",
      targetName: "redis",
    },
    {
      id: "link-5",
      sourceId: IDS.grafana,
      targetId: IDS.prometheus,
      type: "dependency",
      label: "metrics",
      description: "",
      sourceName: "grafana",
      targetName: "prometheus",
    },
  ],
};

export const CONFIG = dashboardConfigResponseSchema.parse({
  version: "dev",
  certVaultConfigured: false,
  certVaultUrl: null,
  dockerHosts: ["unix:///var/run/docker.sock"],
  kubernetesEnabled: "false",
  kubernetesContexts: [],
  kubernetesNamespaces: [],
  networkCidrs: [],
  healthCheckInterval: 30000,
  resourceMonitorInterval: 5000,
  updateCheckInterval: 3600000,
  certificateCheckInterval: 21_600_000,
  certificateExpiryThresholds: "30,14,7,3,1",
  healthHistoryTtlDays: 30,
  appriseConfigured: false,
  containerControlsEnabled: true,
  healthHistoryEnabled: true,
  resourceMonitorEnabled: true,
  cpuSpikeThreshold: 90,
  memorySpikeThreshold: 90,
  spikeDurationThreshold: 300,
  fileExplorerEnabled: true,
  terminalEnabled: true,
});

export const STATS = {
  cpuPercent: 3.2,
  memoryUsed: 142_606_336, // ~136 MB
  memoryLimit: 8_589_934_592, // 8 GB
  memoryPercent: 1.7,
  networkRx: 284_327_936, // ~271 MB
  networkTx: 58_720_256, // ~56 MB
  blockRead: 1_073_741_824, // 1 GB
  blockWrite: 524_288_000, // 500 MB
};

export const RESOURCE_HISTORY = Array.from({ length: 80 }, (_, i) => ({
  cpuPercent: 2.5 + Math.sin(i / 5) * 1.4 + (i % 19 === 0 ? 7 : 0),
  memoryPercent: 1.4 + (i / 80) * 0.3,
}));

export const CHANGELOG_RELEASE = {
  version: "v3.2.1",
  publishedAt: "2024-12-20T10:00:00Z",
  body: [
    "## Bug Fixes",
    "",
    "- Fix certificate resolution for wildcard domains ([#11234](https://github.com/traefik/traefik/issues/11234))",
    "- Fix middleware chain ordering in complex routing rules",
    "",
    "## Improvements",
    "",
    "- Improve WebSocket proxy performance under high connection load",
    "- Reduce memory allocations during routing table updates",
    "",
    "## Dependencies",
    "",
    "- Update `golang.org/x/crypto` to v0.31.0",
    "- Update Docker API client to v27.4.0",
  ].join("\n"),
  htmlUrl: "https://github.com/traefik/traefik/releases/tag/v3.2.1",
};

export const CHANGELOG = {
  available: true,
  release: CHANGELOG_RELEASE,
  releases: [CHANGELOG_RELEASE],
};

export const TLS_CERTIFICATES = [
  {
    serviceId: IDS.traefik,
    hostname: "dashboard.example.com",
    port: 443,
    health: "healthy",
    certVaultStatus: "different",
    trusted: true,
    hostnameValid: true,
    validFrom: "2026-05-19T00:00:00.000Z",
    validTo: "2026-11-17T23:59:59.000Z",
    daysRemaining: 93,
    issuer: "Let's Encrypt R13",
    serial: "04:A8:2C:71:9F:30:DE:42",
    fingerprintSha256: "A4:7B:90:13:CE:68:2F:95:44:12:DD:6E:31:79:AB:08",
    domains: ["dashboard.example.com", "*.example.com"],
  },
  {
    serviceId: IDS.nginx,
    hostname: "app.example.com",
    port: 443,
    health: "healthy",
    certVaultStatus: "in-use",
    trusted: true,
    hostnameValid: true,
    validFrom: "2026-07-01T00:00:00.000Z",
    validTo: "2026-12-30T23:59:59.000Z",
    daysRemaining: 136,
    issuer: "Let's Encrypt R13",
    serial: "03:17:B2:8D:E4:55:90:CA",
    fingerprintSha256: "7D:2E:44:AF:51:C8:90:6B:33:ED:21:73:9A:4F:BC:65",
    domains: ["app.example.com"],
  },
];

export const FILES = {
  path: "/",
  entries: [
    {
      name: "bin",
      type: "directory",
      size: 4096,
      permissions: "drwxr-xr-x",
      modified: "2024-12-01T00:00:00Z",
    },
    {
      name: "dev",
      type: "directory",
      size: 360,
      permissions: "drwxr-xr-x",
      modified: "2024-12-20T10:00:00Z",
    },
    {
      name: "etc",
      type: "directory",
      size: 4096,
      permissions: "drwxr-xr-x",
      modified: "2024-12-01T00:00:00Z",
    },
    {
      name: "home",
      type: "directory",
      size: 4096,
      permissions: "drwxr-xr-x",
      modified: "2024-12-01T00:00:00Z",
    },
    {
      name: "proc",
      type: "directory",
      size: 0,
      permissions: "dr-xr-xr-x",
      modified: "2024-12-20T10:00:00Z",
    },
    {
      name: "root",
      type: "directory",
      size: 4096,
      permissions: "drwx------",
      modified: "2024-12-20T10:00:00Z",
    },
    {
      name: "sys",
      type: "directory",
      size: 0,
      permissions: "dr-xr-xr-x",
      modified: "2024-12-20T10:00:00Z",
    },
    {
      name: "tmp",
      type: "directory",
      size: 4096,
      permissions: "drwxrwxrwt",
      modified: "2024-12-20T10:00:00Z",
    },
    {
      name: "traefik",
      type: "file",
      size: 38291456,
      permissions: "-rwxr-xr-x",
      modified: "2024-12-20T10:00:00Z",
    },
    {
      name: "usr",
      type: "directory",
      size: 4096,
      permissions: "drwxr-xr-x",
      modified: "2024-12-01T00:00:00Z",
    },
    {
      name: "var",
      type: "directory",
      size: 4096,
      permissions: "drwxr-xr-x",
      modified: "2024-12-01T00:00:00Z",
    },
  ],
};

// Terminal output lines (ASCII + ANSI only — btoa-safe)
export const TERMINAL_LINES = [
  "",
  "\x1b[01;32mroot\x1b[00m@\x1b[01;34mtraefik\x1b[00m:/# traefik version",
  "Version:      3.2.1",
  "Codename:     lanternfish",
  "Go version:   go1.23.4",
  "Built:        2024-12-20T10:00:00Z",
  "OS/Arch:      linux/amd64",
  "",
  "\x1b[01;32mroot\x1b[00m@\x1b[01;34mtraefik\x1b[00m:/# ",
];
