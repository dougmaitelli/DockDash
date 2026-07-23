import { EventEmitter, Readable } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceProtocol } from "@shared";

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
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };

  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    stdout.push(null);

    return true;
  });

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
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    proc.emit("close");

    return true;
  });

  setImmediate(() => {
    if (stdoutData) proc.stdout.emit("data", Buffer.from(stdoutData));

    if (stderrData) proc.stderr.emit("data", Buffer.from(stderrData));

    setImmediate(() => proc.emit("close"));
  });

  return proc;
}

function makeHangingPortScanProcess() {
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    proc.emit("close");

    return true;
  });

  return proc;
}

function makeFailingPortScanProcess(error: Error) {
  const proc = makeHangingPortScanProcess();

  setImmediate(() => proc.emit("error", error));

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

  it("rejects an invalid target without spawning nmap", async () => {
    const consume = async () => {
      for await (const _batch of networkScanner.scanNetworkStream("not-a-cidr")) {
        // no-op
      }
    };

    await expect(consume()).rejects.toThrow("Invalid IPv4 CIDR");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("kills active nmap processes when the scan is aborted", async () => {
    const pingProcess = makePingSweepProcess(["Host: 192.168.1.5 (myhost.local) Status: Up"]);
    const portProcess = makeHangingPortScanProcess();
    const controller = new AbortController();
    let spawnCallCount = 0;

    mockSpawn.mockImplementation(() => (spawnCallCount++ === 0 ? pingProcess : portProcess));

    const consume = async () => {
      for await (const _batch of networkScanner.scanNetworkStream(
        "192.168.1.0/24",
        false,
        controller.signal,
      )) {
        // no-op
      }
    };
    const scan = consume();

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    controller.abort();
    await scan;

    expect(portProcess.kill).toHaveBeenCalled();
  });

  it("uses the full port range for a deep scan", async () => {
    const pingProcess = makePingSweepProcess(["Host: 192.168.1.5 (host) Status: Up"]);
    const portProcess = makePortScanProcess("Host: 192.168.1.5 (host) Status: Up\n");

    mockSpawn.mockReturnValueOnce(pingProcess).mockReturnValueOnce(portProcess);

    for await (const _batch of networkScanner.scanNetworkStream("192.168.1.0/24", true)) {
      // consume
    }

    expect(mockSpawn).toHaveBeenNthCalledWith(
      2,
      "nmap",
      expect.arrayContaining(["-p-", "192.168.1.5"]),
    );
  });

  it("continues the sweep when an individual port-scan process fails", async () => {
    mockSpawn
      .mockReturnValueOnce(makePingSweepProcess(["Host: 192.168.1.5 (host) Status: Up"]))
      .mockReturnValueOnce(makeFailingPortScanProcess(new Error("spawn failed")));

    const results = [];

    for await (const batch of networkScanner.scanNetworkStream("192.168.1.0/24")) {
      results.push(...batch);
    }

    expect(results).toEqual([]);
  });

  it("returns immediately when passed an already-aborted signal", async () => {
    const controller = new AbortController();

    controller.abort();

    const results = [];

    for await (const batch of networkScanner.scanNetworkStream(
      "192.168.1.0/24",
      false,
      controller.signal,
    )) {
      results.push(...batch);
    }

    expect(results).toEqual([]);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("NetworkScanner service detection", () => {
  type ScannerInternals = {
    detectService(
      ip: string,
      port: number,
      protocol: ServiceProtocol,
      signal?: AbortSignal,
    ): Promise<string | undefined>;
  };

  beforeEach(() => vi.clearAllMocks());

  it("uses an HTTP page title when one is available", async () => {
    mockAxios.get.mockResolvedValue({ status: 200, data: "<title> Dashboard </title>" });
    const scanner = new NetworkScanner() as unknown as ScannerInternals;

    await expect(scanner.detectService("10.0.0.1", 80, ServiceProtocol.HTTP)).resolves.toBe(
      "Dashboard",
    );
  });

  it("falls back to health endpoints when the root page has no title", async () => {
    mockAxios.get
      .mockResolvedValueOnce({ status: 200, data: "<html></html>" })
      .mockResolvedValueOnce({ status: 200, data: "<title>Healthy App</title>" });
    const scanner = new NetworkScanner() as unknown as ScannerInternals;

    await expect(scanner.detectService("10.0.0.1", 80, ServiceProtocol.HTTP)).resolves.toBe(
      "Healthy App",
    );
  });

  it("identifies SSH and known non-HTTP ports", async () => {
    const scanner = new NetworkScanner() as unknown as ScannerInternals;

    await expect(scanner.detectService("10.0.0.1", 22, ServiceProtocol.SSH)).resolves.toBe(
      "SSH Server",
    );
    await expect(
      scanner.detectService("10.0.0.1", 5432, ServiceProtocol.TCP),
    ).resolves.toBeDefined();
  });

  it("returns undefined for an unknown non-HTTP port", async () => {
    const scanner = new NetworkScanner() as unknown as ScannerInternals;

    await expect(
      scanner.detectService("10.0.0.1", 65000, ServiceProtocol.TCP),
    ).resolves.toBeUndefined();
  });
});
