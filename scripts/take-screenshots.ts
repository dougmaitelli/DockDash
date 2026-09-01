import { spawn } from "child_process";
import path from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

import { dashboardConfigResponseSchema } from "../src/shared/responseSchemas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8089;
// Use 127.0.0.1 explicitly — inside Docker, 'localhost' can resolve to ::1
// (IPv6) while Vite binds to the IPv4 loopback only.
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const IDS = {
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
) {
  return {
    id,
    name,
    host,
    ports,
    checkPort: ports[0],
    source: "docker",
    status,
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

const SERVICES = [
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
    ...makeService(IDS.nginx, "nginx", "app.example.com", [80, 443], "up", "nginx", "1.27", [
      "web",
    ]),
    protocol: "https",
    checkPort: 443,
  },
  makeService(IDS.postgres, "postgres", "172.17.0.12", [5432], "up", "postgres", "17", [
    "internal",
  ]),
  makeService(IDS.redis, "redis", "172.17.0.13", [6379], "up", "redis", "7", ["internal"]),
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
  ),
];

const POSITIONS = [
  { serviceId: IDS.traefik, x: 420, y: 80 },
  { serviceId: IDS.nginx, x: 140, y: 300 },
  { serviceId: IDS.postgres, x: 100, y: 520 },
  { serviceId: IDS.redis, x: 380, y: 520 },
  { serviceId: IDS.grafana, x: 720, y: 300 },
  { serviceId: IDS.prometheus, x: 720, y: 520 },
];

const DASHBOARD = {
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

const CONFIG = dashboardConfigResponseSchema.parse({
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

const STATS = {
  cpuPercent: 3.2,
  memoryUsed: 142_606_336, // ~136 MB
  memoryLimit: 8_589_934_592, // 8 GB
  memoryPercent: 1.7,
  networkRx: 284_327_936, // ~271 MB
  networkTx: 58_720_256, // ~56 MB
  blockRead: 1_073_741_824, // 1 GB
  blockWrite: 524_288_000, // 500 MB
};

const RESOURCE_HISTORY = Array.from({ length: 80 }, (_, i) => ({
  cpuPercent: 2.5 + Math.sin(i / 5) * 1.4 + (i % 19 === 0 ? 7 : 0),
  memoryPercent: 1.4 + (i / 80) * 0.3,
}));

const CHANGELOG_RELEASE = {
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

const CHANGELOG = {
  available: true,
  release: CHANGELOG_RELEASE,
  releases: [CHANGELOG_RELEASE],
};

const TLS_CERTIFICATES = [
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

const FILES = {
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
const TERMINAL_LINES = [
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}`);

      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  throw new Error(`Port ${port} not ready after ${timeoutMs}ms`);
}

function startVite(): Promise<() => void> {
  const vite = path.join(ROOT, "node_modules/.bin/vite");
  const proc = spawn(vite, ["--port", String(PORT)], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  proc.on("error", (err) => {
    console.error("Vite process error:", err);
  });

  return waitForPort(PORT).then(() => () => {
    proc.kill("SIGTERM");
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Starting Vite dev server…");
  const stopVite = await startVite();

  // --no-sandbox is required when running as root (Docker / CI)
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();

  // Inject localStorage theme + EventSource mock before any page scripts run.
  // Uses ES6 class syntax so `super()` properly initialises EventTarget's
  // native internal slots — ES5 EventTarget.call(this) doesn't work in Chromium.
  const terminalLinesJson = JSON.stringify(TERMINAL_LINES);

  await page.addInitScript(`(function () {
    localStorage.setItem('dockdash-theme', 'dark');

    var lines = ${terminalLinesJson};
    var OrigEventSource = window.EventSource;

    class MockEventSource extends EventTarget {
      constructor(url) {
        super();
        this.url = url;
        this.withCredentials = false;
        this.readyState = 1;
        this.onmessage = null;
        this.onerror = null;

        if (url.indexOf('/terminal/stream') !== -1) {
          var self = this;
          setTimeout(function () {
            self.dispatchEvent(new MessageEvent('terminal-session', {
              data: JSON.stringify({ sessionId: 'mock-session' })
            }));
            lines.forEach(function (line, i) {
              setTimeout(function () {
                var text = line + (i < lines.length - 1 ? '\\r\\n' : '');
                try {
                  var b64 = btoa(text);
                  var evt = new MessageEvent('message', { data: JSON.stringify(b64) });
                  self.dispatchEvent(evt);
                  if (self.onmessage) self.onmessage(evt);
                } catch (e) { /* skip unencodable chars */ }
              }, 100 + i * 40);
            });
          }, 400);
          return;
        }

        // Non-terminal SSE: hand off to the real EventSource
        return new OrigEventSource(url);
      }

      close() { this.readyState = 2; }
    }

    MockEventSource.CONNECTING = 0;
    MockEventSource.OPEN = 1;
    MockEventSource.CLOSED = 2;

    window.EventSource = MockEventSource;
  })();`);

  // Mock all API endpoints
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;

    if (p === "/api/config") return route.fulfill({ json: CONFIG });

    if (p === "/api/services") return route.fulfill({ json: SERVICES });

    if (p === "/api/dashboard") return route.fulfill({ json: DASHBOARD });

    if (p === "/api/serviceStatuses")
      return route.fulfill({ json: SERVICES.map((s) => ({ id: s.id, status: s.status })) });

    if (p === "/api/docker/health")
      return route.fulfill({
        json: [
          {
            id: "local",
            name: "Local Docker",
            host: "unix:///var/run/docker.sock",
            connected: true,
            containers: 6,
            containersRunning: 6,
          },
        ],
      });

    if (p === "/api/app-update") return route.fulfill({ json: { hasUpdate: false } });

    if (p === "/api/tls-certificates") return route.fulfill({ json: TLS_CERTIFICATES });

    const certificateMatch = p.match(/^\/api\/services\/([^/]+)\/tls-certificate$/);

    if (certificateMatch) {
      const certificate = TLS_CERTIFICATES.find(
        ({ serviceId }) => serviceId === certificateMatch[1],
      );

      return certificate
        ? route.fulfill({ json: certificate })
        : route.fulfill({ status: 404, json: { error: "No TLS certificate found" } });
    }

    if (/\/api\/services\/[^/]+\/health-history/.test(p)) {
      const buckets = Array.from({ length: 80 }, (_, i) => {
        if (i % 17 === 5 || i % 23 === 11) return "down";

        if (i % 37 === 29) return null;

        return "up";
      });

      return route.fulfill({ json: buckets });
    }

    if (/\/api\/services\/[^/]+\/stats/.test(p)) return route.fulfill({ json: STATS });

    if (/\/api\/services\/[^/]+\/resource-history/.test(p))
      return route.fulfill({ json: RESOURCE_HISTORY });

    if (/\/api\/services\/[^/]+\/changelog/.test(p)) return route.fulfill({ json: CHANGELOG });

    if (/\/api\/services\/[^/]+\/files/.test(p) && !p.includes("/content"))
      return route.fulfill({ json: FILES });

    // Terminal input, other POSTs/DELETEs
    return route.fulfill({ status: 200, json: { success: true } });
  });

  try {
    // -----------------------------------------------------------------------
    // Screenshot 1: Dashboard canvas
    // -----------------------------------------------------------------------
    console.log("Navigating to dashboard…");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-service-id]", { timeout: 15_000 });
    // Click "Fit to screen" to force fitToContent() to run against the fully
    // laid-out DOM — this guarantees offsetWidth/offsetHeight are correct when
    // link paths are recomputed, avoiding misalignment on first render.
    await page.click('button[title="Fit to screen"]');
    await page.waitForFunction((expectedLinks) => {
      const linkLayer = document.querySelector("[data-link-layer]");

      return (
        linkLayer !== null &&
        linkLayer.getBoundingClientRect().height > 0 &&
        linkLayer.querySelectorAll("[data-link-id]").length === expectedLinks
      );
    }, DASHBOARD.links.length);
    await page.waitForTimeout(100);
    await page.screenshot({ path: "screenshots/1.png" });
    console.log("✓ screenshots/1.png");

    // -----------------------------------------------------------------------
    // Open the service drawer on the traefik node (double-click = edit/view)
    // -----------------------------------------------------------------------
    await page.dblclick(`[data-service-id="${IDS.traefik}"]`);
    await page.waitForSelector("[data-drawer]", { timeout: 5000 });

    // -----------------------------------------------------------------------
    // Screenshot 2: Details tab (default) with health history graph
    // -----------------------------------------------------------------------
    // Health history is fetched on mount; the mock returns immediately so a
    // short pause is enough for the graph divs to render.
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Certificate" }).click();
    await page.getByText("dashboard.example.com:443").waitFor();
    await page.screenshot({ path: "screenshots/2.png" });
    console.log("✓ screenshots/2.png");

    // -----------------------------------------------------------------------
    // Screenshot 3: Details tab with certificate collapsed and resources
    // -----------------------------------------------------------------------
    await page.getByRole("button", { name: "Certificate" }).click();
    await page.locator("[data-drawer] .overflow-y-auto").evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "screenshots/3.png" });
    console.log("✓ screenshots/3.png");

    // -----------------------------------------------------------------------
    // Screenshot 5: Changelog tab
    // -----------------------------------------------------------------------
    await page.click('button:has-text("Changelog")');
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshots/5.png" });
    console.log("✓ screenshots/5.png");

    // -----------------------------------------------------------------------
    // Screenshot 6: Files tab (captured before Terminal to avoid any xterm
    // side-effects disrupting subsequent tab interactions)
    // -----------------------------------------------------------------------
    await page.click('button:has-text("Files")');
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshots/6.png" });
    console.log("✓ screenshots/6.png");

    // -----------------------------------------------------------------------
    // Screenshot 7: Terminal tab (last — xterm init may affect drawer state)
    // -----------------------------------------------------------------------
    await page.click('button:has-text("Terminal")');
    // Wait for xterm to initialise and the mock SSE to deliver all lines
    await page.waitForTimeout(1800);
    await page.screenshot({ path: "screenshots/7.png" });
    console.log("✓ screenshots/7.png");

    // -----------------------------------------------------------------------
    // Screenshot 4: Services table
    // -----------------------------------------------------------------------
    await page.goto(`${BASE_URL}/services`, { waitUntil: "networkidle" });
    await page.waitForSelector("tbody tr", { timeout: 10_000 });
    // MiniHealthBar fetches health history per row — give all 6 a render cycle
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshots/4.png" });
    console.log("✓ screenshots/4.png");
  } finally {
    await browser.close();
    stopVite();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
