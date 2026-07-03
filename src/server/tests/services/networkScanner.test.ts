import { EventEmitter, Readable } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──

const mockSpawn = vi.hoisted(() => vi.fn());
const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("child_process", () => ({ spawn: mockSpawn }));
vi.mock("axios", () => ({ default: mockAxios }));

const { networkScanner, NetworkScanner } = await import("@server/services/networkScanner.js");

// ── Helpers ──

/**
 * Creates a fake nmap ping-sweep process whose stdout emits the given lines
 * then ends, mimicking the greppable (-oG -) output format.
 */
function makePingSweepProcess(lines: string[], stderrText = "") {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: Readable;
    stderr: Readable;
  };

  proc.stdout = stdout;
  proc.stderr = stderr;

  setImmediate(() => {
    for (const line of lines) stdout.push(`${line}\n`);

    stdout.push(null);

    if (stderrText) stderr.push(stderrText);

    stderr.push(null);
  });

  return proc;
}

/**
 * Creates a fake nmap port-scan process that emits a stdout data event and
 * then fires "close".
 */
function makePortScanProcess(stdoutData: string, stderrData = "") {
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  setImmediate(() => {
    if (stdoutData) proc.stdout.emit("data", Buffer.from(stdoutData));

    if (stderrData) proc.stderr.emit("data", Buffer.from(stderrData));

    setImmediate(() => proc.emit("close"));
  });

  return proc;
}

// ── Tests ──

describe("NetworkScanner.parseNmapOpenPorts (via private access)", () => {
  it("extracts open TCP port numbers from greppable nmap output", () => {
    const output =
      "Host: 192.168.1.5 (host.local) Ports: 80/open/tcp/////, 443/open/tcp/////, 22/open/tcp/////\n";
    const ports = (
      networkScanner as unknown as { parseNmapOpenPorts(s: string): number[] }
    ).parseNmapOpenPorts(output);

    expect(ports).toEqual([80, 443, 22]);
  });

  it("ignores filtered and closed ports", () => {
    const output =
      "Host: 10.0.0.1 (host) Ports: 80/open/tcp/////, 8080/filtered/tcp/////, 443/closed/tcp/////\n";
    const ports = (
      networkScanner as unknown as { parseNmapOpenPorts(s: string): number[] }
    ).parseNmapOpenPorts(output);

    expect(ports).toEqual([80]);
  });

  it("returns an empty array when there are no open ports", () => {
    const output = "Host: 10.0.0.1 (host) Status: Up\n";
    const ports = (
      networkScanner as unknown as { parseNmapOpenPorts(s: string): number[] }
    ).parseNmapOpenPorts(output);

    expect(ports).toEqual([]);
  });

  it("ignores non-Host lines", () => {
    const output = [
      "# Nmap 7.80 scan initiated...",
      "Host: 10.0.0.1 (host) Ports: 80/open/tcp/////",
      "# Nmap done.",
    ].join("\n");

    const ports = (
      networkScanner as unknown as { parseNmapOpenPorts(s: string): number[] }
    ).parseNmapOpenPorts(output);

    expect(ports).toEqual([80]);
  });
});

describe("NetworkScanner.parseCIDRConfig", () => {
  afterEach(() => {
    delete process.env.NETWORK_CIDRS;
  });

  it("returns the configured CIDR(s) from NETWORK_CIDRS", () => {
    process.env.NETWORK_CIDRS = "10.0.0.0/8,172.16.0.0/12";
    const scanner = new NetworkScanner();
    const cidrs = scanner.parseCIDRConfig();

    expect(cidrs).toEqual([{ cidr: "10.0.0.0/8" }, { cidr: "172.16.0.0/12" }]);
  });

  it("returns the default CIDR when NETWORK_CIDRS is not set", () => {
    delete process.env.NETWORK_CIDRS;
    const scanner = new NetworkScanner();
    const cidrs = scanner.parseCIDRConfig();

    expect(cidrs).toHaveLength(1);
    expect(cidrs[0].cidr).toMatch(/\//); // is a CIDR notation
  });
});

describe("NetworkScanner.scanNetworkStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.get.mockResolvedValue({
      status: 200,
      data: "<html><title>Test App</title></html>",
      headers: {},
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("yields one Service per discovered host with open ports", async () => {
    const pingSweepLines = [
      "# Nmap scan initiated",
      "Host: 192.168.1.5 (myhost.local) Status: Up",
      "# Nmap done.",
    ];

    const portScanOutput =
      "Host: 192.168.1.5 (myhost.local) Ports: 80/open/tcp/////, 443/open/tcp/////\n";

    let spawnCallCount = 0;

    mockSpawn.mockImplementation(() => {
      if (spawnCallCount++ === 0) {
        return makePingSweepProcess(pingSweepLines);
      }

      return makePortScanProcess(portScanOutput);
    });

    const results: unknown[] = [];

    for await (const batch of networkScanner.scanNetworkStream("192.168.1.0/24")) {
      results.push(...batch);
    }

    expect(results).toHaveLength(1);

    const service = results[0] as { host: string; ports: number[] };

    expect(service.host).toBe("192.168.1.5");
    expect(service.ports).toContain(80);
    expect(service.ports).toContain(443);
  });

  it("yields nothing when no hosts are found by the ping sweep", async () => {
    const pingSweepLines = ["# Nmap scan", "# Nmap done."];

    mockSpawn.mockImplementation(() => makePingSweepProcess(pingSweepLines));

    const results: unknown[] = [];

    for await (const batch of networkScanner.scanNetworkStream("192.168.2.0/24")) {
      results.push(...batch);
    }

    expect(results).toHaveLength(0);
  });

  it("yields a service with empty ports for a host with no open ports", async () => {
    const pingSweepLines = ["Host: 192.168.1.10 (silent.local) Status: Up"];

    // Port scan returns a host line but no Ports entry — no open ports
    const portScanOutput = "Host: 192.168.1.10 (silent.local) Status: Up\n";

    let spawnCallCount = 0;

    mockSpawn.mockImplementation(() => {
      if (spawnCallCount++ === 0) return makePingSweepProcess(pingSweepLines);

      return makePortScanProcess(portScanOutput);
    });

    const results: unknown[] = [];

    for await (const batch of networkScanner.scanNetworkStream("192.168.1.0/24")) {
      results.push(...batch);
    }

    // The host is alive but has no open ports — scanHost still returns a service
    expect(results).toHaveLength(1);
    expect((results[0] as { host: string }).host).toBe("192.168.1.10");
    expect((results[0] as { ports: number[] }).ports).toHaveLength(0);
  });
});
