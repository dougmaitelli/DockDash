import { spawn } from "child_process";
import path from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

import {
  CHANGELOG,
  CONFIG,
  DASHBOARD,
  FILES,
  IDS,
  RESOURCE_HISTORY,
  RESOURCE_USAGE,
  SERVICES,
  STATS,
  TERMINAL_LINES,
  TLS_CERTIFICATES,
} from "./fixtures/ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8089;
// Use 127.0.0.1 explicitly — inside Docker, 'localhost' can resolve to ::1
// (IPv6) while Vite binds to the IPv4 loopback only.
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

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

    if (p === "/api/labels")
      return route.fulfill({
        json: [...new Set(SERVICES.flatMap(({ labels }) => labels))].sort(),
      });

    if (p === "/api/dashboard") return route.fulfill({ json: DASHBOARD });

    if (p === "/api/serviceStatuses")
      return route.fulfill({
        json: SERVICES.map((service) => ({
          id: service.id,
          status: service.status,
          ...RESOURCE_USAGE[service.id],
        })),
      });

    if (p === "/api/docker/health")
      return route.fulfill({
        json: [
          {
            id: "local",
            name: "Local",
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
