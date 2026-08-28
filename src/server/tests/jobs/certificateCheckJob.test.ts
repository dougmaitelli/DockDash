import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ certificateCheckInterval: 21_600_000 }));
const mockMonitor = vi.hoisted(() => ({ checkAll: vi.fn() }));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/services/certificateMonitorService.js", () => ({
  certificateMonitorService: mockMonitor,
}));

const { CertificateCheckJob } = await import("@server/jobs/CertificateCheckJob.js");

describe("CertificateCheckJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs immediately at the configured interval", () => {
    const job = new CertificateCheckJob();

    expect(job.name).toBe("CertificateCheckJob");
    expect(job.intervalMs).toBe(21_600_000);
    expect(job.runImmediately).toBe(true);
  });

  it("waits for certificate monitoring", async () => {
    mockMonitor.checkAll.mockResolvedValue(undefined);

    await new CertificateCheckJob().run();

    expect(mockMonitor.checkAll).toHaveBeenCalledOnce();
  });
});
