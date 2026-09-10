import { IDS } from "../scripts/fixtures/ui.js";
import { expect, navigate, screenshot, test } from "./fixtures.js";

test("login and authentication error", async ({ page }) => {
  // The identity provider is outside this suite. Exercise the logged-out UI.
  await page.route("**/auth/me", (route) => route.fulfill({ json: { enabled: true, user: null } }));

  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Login with SSO" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login with SSO" })).toHaveAttribute(
    "href",
    "/auth/login",
  );
  await screenshot(page, "login.png");

  await page.goto("/login?error=invalid_state");

  await expect(page.getByText("Authentication failed. Please try again.")).toBeVisible();
  await screenshot(page, "login-error.png");
});

test("dashboard and navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-service-id]")).toHaveCount(6);

  await page.getByRole("button", { name: "Fit to screen" }).click();

  await expect(page.locator("[data-link-id]")).toHaveCount(5);
  await expect(page.locator(`[data-service-id="${IDS.grafana}"]`)).toContainText("kubernetes");
  await expect(page.locator(`[data-service-id="${IDS.prometheus}"]`)).toContainText("kubernetes");
  await screenshot(page, "dashboard.png");

  await navigate(page, "Services");

  await expect(page).toHaveURL(/\/services$/);
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator("tbody tr").filter({ hasText: "Kubernetes" })).toHaveCount(2);
  await expect(page.locator("tbody tr").filter({ hasText: "grafana" })).toContainText("homelab");
  await screenshot(page, "services.png");

  await page.getByPlaceholder("Search by name, host, label, or port…").fill("Production");

  await expect(page.locator("tbody tr")).toHaveCount(4);
  await screenshot(page, "services-filtered.png");

  await page.getByPlaceholder("Search by name, host, label, or port…").fill("no-such-service");

  await expect(page.getByText("No services match the current filters.")).toBeVisible();
  await screenshot(page, "services-no-results.png");
});

test("service details, certificates and resources", async ({ page }) => {
  await page.goto("/");
  await page.locator(`[data-service-id="${IDS.traefik}"]`).dblclick();

  await expect(page.locator("[data-drawer]")).toBeVisible();
  await expect(page.getByText("Health History", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Certificate$/ }).click();

  await expect(page.getByText("dashboard.example.com:443")).toBeVisible();

  await page
    .locator("[data-drawer] .overflow-y-auto")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await screenshot(page, "service-certificate.png");

  await page.getByRole("button", { name: /Certificate$/ }).click();
  await page
    .locator("[data-drawer] .overflow-y-auto")
    .evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));

  await expect(page.getByText("Resource Monitor", { exact: true })).toBeVisible();
  await screenshot(page, "service-resources.png");

  await page.goto("/");
  await page.locator(`[data-service-id="${IDS.grafana}"]`).dblclick();

  await expect(page.locator("[data-drawer]")).toContainText("homelab");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restart", exact: true })).toBeEnabled();
  await screenshot(page, "kubernetes-service-details.png");

  await page
    .locator("[data-drawer] .overflow-y-auto")
    .evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));

  await expect(page.getByText("Network (Pod) / Disk I/O", { exact: true })).toBeVisible();
  await expect(page.getByText("37.5%", { exact: true }).first()).toBeVisible();
  await screenshot(page, "kubernetes-service-resources.png");
});

test("service changelog, files, logs and terminal", async ({ page }) => {
  for (const service of [
    { id: IDS.traefik, prefix: "service", log: /GET \/healthz 200 1ms/, prompt: "root@traefik" },
    {
      id: IDS.grafana,
      prefix: "kubernetes-service",
      log: /GET \/api\/health 200 2ms/,
      prompt: "root@grafana",
    },
  ]) {
    await page.goto("/");
    await page.locator(`[data-service-id="${service.id}"]`).dblclick();

    await page.getByRole("button", { name: "Changelog", exact: true }).click();

    await expect(
      page.getByText("Improve WebSocket proxy performance under high connection load"),
    ).toBeVisible();
    await screenshot(page, `${service.prefix}-changelog.png`);

    await page.getByRole("button", { name: "Files", exact: true }).click();

    await expect(page.getByText("traefik", { exact: true }).last()).toBeVisible();
    await screenshot(page, `${service.prefix}-files.png`);

    await page.getByRole("button", { name: "Logs", exact: true }).click();

    await expect(page.getByText(service.log)).toBeVisible();
    await screenshot(page, `${service.prefix}-logs.png`);

    await page.getByRole("button", { name: "Terminal", exact: true }).click();

    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.locator(".xterm-rows")).toContainText(service.prompt);

    // Blur the terminal to make its cursor stable without masking its output.
    await page.getByRole("button", { name: "Terminal", exact: true }).focus();
    await screenshot(page, `${service.prefix}-terminal.png`);
  }
});

test("discovery imports a service through the real API", async ({ page, request }) => {
  await page.goto("/");
  await navigate(page, "Discovery");

  await page.getByRole("button", { name: "Scan Docker", exact: true }).click();

  await expect(page.getByText("Found 5 containers")).toBeVisible();
  await screenshot(page, "discovery-results.png", true);

  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("0 not monitored")).toBeVisible();

  const services = await (await request.get("/api/services")).json();

  expect(services.some((service: { name: string }) => service.name === "worker")).toBeTruthy();

  await page.getByRole("button", { name: "Scan Kubernetes", exact: true }).click();

  await expect(page.getByText("Discovered 3 Kubernetes containers", { exact: true })).toBeVisible();
  await expect(page.getByText("kube-agent", { exact: true })).toBeVisible();
  await screenshot(page, "kubernetes-discovery-results.png", true);

  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);

  const imported = await (await request.get("/api/services")).json();

  expect(imported).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "kube-agent",
        source: "kubernetes",
        metadata: expect.objectContaining({ namespace: "monitoring", podUid: "kube-agent-pod" }),
      }),
    ]),
  );

  await navigate(page, "Services");

  await expect(page.locator("tbody tr")).toHaveCount(8);
  await expect(page.locator("tbody tr").filter({ hasText: "Kubernetes" })).toHaveCount(3);

  await page.reload();

  await expect(page.locator("tbody tr")).toHaveCount(8);
});

test("empty discovery and CIDR validation", async ({ page, request }) => {
  await request.post("/__test/reset", { data: { scenario: "scan-empty" } });

  await page.goto("/discover");
  await page.getByRole("button", { name: "Scan Docker", exact: true }).click();

  await expect(page.getByText("Discovered 0 Docker containers")).toBeVisible();

  await page.getByRole("button", { name: "Scan Kubernetes", exact: true }).click();

  await expect(page.getByText("Discovered 0 Kubernetes containers")).toBeVisible();

  await page.getByPlaceholder("Add CIDR (e.g., 10.0.0.0/8)").fill("invalid");
  await page.getByPlaceholder("Add CIDR (e.g., 10.0.0.0/8)").press("Enter");

  await expect(page.getByText("Invalid CIDR — expected format: x.x.x.x/xx")).toBeVisible();
  await screenshot(page, "discovery-validation.png", true);
});

test("settings and theme selection", async ({ page, colorScheme }) => {
  await page.goto("/");
  await navigate(page, "Settings");

  await expect(page.getByRole("heading", { name: /Environment Variables/ })).toBeVisible();
  await screenshot(page, "settings.png", true);

  await page.getByRole("combobox").click();

  await expect(page.getByRole("listbox")).toBeVisible();
  await screenshot(page, "theme-menu.png");

  const nextTheme = colorScheme === "light" ? "Dark" : "Light";

  await page.getByRole("option", { name: nextTheme, exact: true }).click();

  await expect(page.getByRole("combobox")).toHaveText(nextTheme);

  await page.reload();

  await expect(page.getByRole("combobox")).toHaveText(nextTheme);
});

test("add service form validates and persists", async ({ page, request }) => {
  await page.goto("/services");

  await expect(page.locator("tbody tr")).toHaveCount(6);

  await page.getByRole("button", { name: "Add Service", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Add Service", exact: true })).toBeVisible();
  await screenshot(page, "add-service.png");

  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Name is required")).toBeVisible();
  await expect(page.getByText("Host is required")).toBeVisible();
  await screenshot(page, "add-service-validation.png");

  await page.getByPlaceholder("Service name", { exact: true }).fill("example");
  await page.getByPlaceholder("IP address or hostname", { exact: true }).fill("example.test");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Add Service", exact: true })).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(7);

  const services = await (await request.get("/api/services")).json();

  expect(services).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "example", host: "example.test" })]),
  );

  await page.reload();

  await expect(page.locator("tbody tr")).toHaveCount(7);
});

test("empty dashboard and services", async ({ page, request }) => {
  await request.post("/__test/reset", { data: { scenario: "empty" } });

  await page.goto("/");

  await expect(
    page.getByText("Nothing on the dashboard yet. Add services from the Services page."),
  ).toBeVisible();
  await screenshot(page, "dashboard-empty.png");

  await page.getByRole("button", { name: "Go to Services" }).click();

  await expect(page.getByText("No services", { exact: true })).toBeVisible();
  await screenshot(page, "services-empty.png");
});

test("dashboard error and retry", async ({ page }) => {
  // Simulate a transport failure, then restore the real API for recovery.
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }),
  );

  await page.goto("/");

  await expect(page.getByText("Failed to load dashboard")).toBeVisible();
  await screenshot(page, "dashboard-error.png");

  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(page.locator("[data-service-id]")).toHaveCount(6);
});
