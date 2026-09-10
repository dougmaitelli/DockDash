import {
  diskCounters,
  networkCounters,
} from "@server/services/containerRuntime/kubernetesMetrics.js";
import { describe, expect, it } from "vitest";

describe("Kubernetes disk counters", () => {
  it("sums devices without including other pods, namespaces, sidecars, or invalid samples", () => {
    const metrics = [
      "# HELP container_fs_reads_bytes_total cumulative reads",
      'container_fs_reads_bytes_total{namespace="default",pod="web",container="app",device="sda",id="a\\\\b"} 1024',
      'container_fs_reads_bytes_total{container="app",pod="web",namespace="default",device="sdb"} 2e3 1234',
      'container_fs_writes_bytes_total{namespace="default",pod="web",container="app"} 0',
      'container_fs_reads_bytes_total{namespace="other",pod="web",container="app"} 9999',
      'container_fs_reads_bytes_total{namespace="default",pod="other",container="app"} 9999',
      'container_fs_reads_bytes_total{namespace="default",pod="web",container="sidecar"} 9999',
      'container_fs_reads_bytes_total{namespace="default",pod="web",container="app"} NaN',
      'container_fs_reads_bytes_total{namespace="default",pod="web",container="app"} -1',
    ].join("\n");

    expect(diskCounters(metrics, "default", "web", "app")).toEqual({
      blockRead: 3024,
      blockWrite: 0,
    });
  });
  it("distinguishes unavailable counters from zero", () => {
    expect(diskCounters("", "default", "web", "app")).toEqual({
      blockRead: null,
      blockWrite: null,
    });
  });
});

describe("Kubernetes network counters", () => {
  it("sums interfaces once and matches pod UID, namespace and name", () => {
    const summary = {
      pods: [
        {
          podRef: { uid: "uid", namespace: "default", name: "web" },
          network: {
            rxBytes: 10,
            txBytes: 20,
            interfaces: [
              { rxBytes: 10, txBytes: 20 },
              { rxBytes: 5, txBytes: 6 },
            ],
          },
        },
      ],
    };

    expect(networkCounters(summary, "uid", "default", "web")).toEqual({
      networkRx: 15,
      networkTx: 26,
    });
    expect(networkCounters(summary, "old", "default", "web")).toEqual({
      networkRx: null,
      networkTx: null,
    });
    expect(networkCounters(summary, "uid", "other", "web")).toEqual({
      networkRx: null,
      networkTx: null,
    });
  });
  it("handles zero, missing and malformed counters", () => {
    expect(
      networkCounters(
        {
          pods: [
            { podRef: { uid: "uid", namespace: "default", name: "web" }, network: { rxBytes: 0 } },
          ],
        },
        "uid",
        "default",
        "web",
      ),
    ).toEqual({ networkRx: 0, networkTx: null });
    expect(networkCounters({ pods: "bad" }, "uid", "default", "web")).toEqual({
      networkRx: null,
      networkTx: null,
    });
  });
});
