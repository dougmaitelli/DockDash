// Test-only entry point. Build beside the production server so it serves the
// same Vite output. None of these overrides or reset routes ship in the app.
import type Docker from "dockerode";
import { MemoryStore, type Options } from "express-rate-limit";
import { PassThrough } from "node:stream";
import { mock } from "node:test";

import {
  CHANGELOG,
  DASHBOARD,
  FILES,
  STATS,
  TERMINAL_LINES,
  TLS_CERTIFICATES,
} from "../scripts/fixtures/ui.js";
import { orm, sqlite } from "../src/server/db/connection.js";
import { labelRepository } from "../src/server/db/labelRepository.js";
import { serviceLinks, servicePositions, services } from "../src/server/db/schema/index.js";
import { BackgroundJob } from "../src/server/jobs/BackgroundJob.js";
import { appUpdateService } from "../src/server/services/appUpdateService.js";
import { certVaultService } from "../src/server/services/certVaultService.js";
import { changelogService } from "../src/server/services/changelogService.js";
import {
  DockerRuntime,
  overrideDockerRuntime,
} from "../src/server/services/containerRuntime/dockerRuntime.js";
import { healthCheckService } from "../src/server/services/healthCheckService.js";
import { MockDockerRuntime } from "../src/server/services/mock/mockDockerRuntime.js";
import { networkScanner } from "../src/server/services/networkScanner.js";
import { terminalService } from "../src/server/services/terminalService.js";
import { tlsCertificateService } from "../src/server/services/tlsCertificateService.js";
import { type Service, ServiceSource, ServiceStatus } from "../src/shared/index.js";
import {
  changelogResponseSchema,
  dashboardDataResponseSchema,
  filesResponseSchema,
  tlsCertificateResponseSchema,
} from "../src/shared/responseSchemas.js";

export const NOW = new Date("2026-08-16T12:00:00.000Z");
mock.timers.enable({ apis: ["Date"], now: NOW });
const data = dashboardDataResponseSchema.parse(DASHBOARD);
const hostId = DockerRuntime.hostId("unix:///var/run/docker.sock");
let scenario = "default";
const rateLimitStores = new Set<MemoryStore>();
const initRateLimit = MemoryStore.prototype.init;

mock.method(MemoryStore.prototype, "init", function (this: MemoryStore, options: Options) {
  rateLimitStores.add(this);

  return initRateLimit.call(this, options);
});

function reset(nextScenario = "default") {
  scenario = nextScenario;

  for (const store of rateLimitStores) void store.resetAll();

  terminalService.shutdown();
  orm.delete(services).run();
  labelRepository.deleteOrphans();

  if (scenario === "empty") return;

  sqlite.transaction(() => {
    for (const [index, service] of data.services.entries()) {
      orm
        .insert(services)
        .values({
          ...service,
          metadata: { ...service.metadata, dockerHostId: hostId },
          status: index === 3 ? ServiceStatus.DOWN : service.status,
        })
        .run();
      labelRepository.replaceForService(service.id, service.labels ?? []);
      orm
        .insert(servicePositions)
        .values({ ...service.position!, serviceId: service.id })
        .run();
      const health = sqlite.prepare(
        "INSERT INTO service_health_history (id, service_id, status, checked_at) VALUES (?, ?, ?, ?)",
      );
      const resources = sqlite.prepare(
        "INSERT INTO service_resource_history (id, service_id, cpu_percent, memory_percent, checked_at) VALUES (?, ?, ?, ?, ?)",
      );

      for (let i = 0; i < 30 * 24; i++) {
        const at = new Date(NOW.getTime() - i * 3600_000).toISOString();

        health.run(`${service.id}-h-${i}`, service.id, i % 17 === 5 ? "down" : "up", at);
        resources.run(
          `${service.id}-r-${i}`,
          service.id,
          12 + Math.sin(i / 5) * 8,
          25 + Math.cos(i / 9) * 4,
          at,
        );
      }
    }

    for (const link of data.links)
      orm
        .insert(serviceLinks)
        .values({ ...link, createdAt: NOW.toISOString() })
        .run();
  })();
}

class TestRuntime extends MockDockerRuntime {
  override async getContainerStats(_container: Docker.Container) {
    return STATS;
  }
  override async *scanDockerContainers(_docker: Docker, _host: string): AsyncGenerator<Service> {
    if (scenario === "scan-empty") return;

    for (const service of data.services)
      yield { ...service, metadata: { ...service.metadata, dockerHostId: hostId } };

    yield {
      ...data.services[0],
      id: "discovered-worker",
      name: "worker",
      host: "worker.example.com",
      source: ServiceSource.DOCKER,
      metadata: {
        dockerHostId: hostId,
        containerId: "worker",
        containerName: "worker",
        image: "nginx",
        imageTag: "1.27",
      },
    };
  }
  override async listFiles(_service: Service, path: string) {
    return filesResponseSchema
      .parse(FILES)
      .entries.filter((entry) => path === "/" || entry.type === "file");
  }
  override async readFile(_service: Service, path: string) {
    return { path, content: "# Test configuration\nport=8080\n" };
  }
  override async writeFile() {
    /* Deliberately no host filesystem access. */
  }
  override async openLogStream() {
    const stream = new PassThrough();

    stream.end("2026-08-16T12:00:00.000Z GET /healthz 200 1ms\n");

    return stream;
  }
  override async openTerminal(owner: string) {
    const stream = new PassThrough();
    const session = terminalService.registerSession(owner, stream);

    stream.write(TERMINAL_LINES.join("\r\n"));

    return session;
  }
}

// Keep real HTTP handlers, validation, repositories, and SSE. Replace only
// background scheduling and external integrations at their service boundary.
mock.method(BackgroundJob.prototype, "start", () => {});
mock.method(healthCheckService, "checkAllServices", async () => {});
mock.method(healthCheckService, "checkSingleService", async () => {});
mock.method(appUpdateService, "check", async () => ({ hasUpdate: false }));
mock.method(changelogService, "fetchChangelog", async () =>
  changelogResponseSchema.parse(CHANGELOG),
);
mock.method(certVaultService, "getDeploymentStatuses", async () => new Map());
mock.method(tlsCertificateService, "getAll", async () =>
  TLS_CERTIFICATES.map((c) => tlsCertificateResponseSchema.parse(c)),
);
mock.method(tlsCertificateService, "getForService", async (id: string) => {
  const certificate = TLS_CERTIFICATES.find((c) => c.serviceId === id);

  return certificate ? tlsCertificateResponseSchema.parse(certificate) : null;
});
mock.method(networkScanner, "scanNetworkStream", async function* () {});
overrideDockerRuntime(new TestRuntime());
reset();

const { default: app } = await import("../src/server/index.js");

app.post("/__test/reset", (req, res) => {
  reset(String(req.body.scenario ?? "default"));
  res.json({ ok: true });
});
