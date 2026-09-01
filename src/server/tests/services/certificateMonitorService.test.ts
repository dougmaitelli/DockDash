import {
  certVaultStatusObservation,
  expiryThreshold,
} from "@server/services/certificateMonitorService.js";
import { describe, expect, it } from "vitest";

import type { TlsCertificate } from "@shared";

describe("expiryThreshold", () => {
  it("returns the most urgent crossed threshold", () => {
    expect(expiryThreshold(20, "30,14,7,3,1")).toBe(30);
    expect(expiryThreshold(10, "30,14,7,3,1")).toBe(14);
    expect(expiryThreshold(1, "30,14,7,3,1")).toBe(1);
  });

  it("ignores invalid and disabled thresholds", () => {
    expect(expiryThreshold(20, "0,nope,-4")).toBeNull();
    expect(expiryThreshold(null, "30")).toBeNull();
  });
});

describe("certVaultStatusObservation", () => {
  const certificate = {
    serviceId: "service-1",
    fingerprintSha256: "abc",
  } as TlsCertificate;

  it("preserves the prior state when the live fingerprint is unavailable", () => {
    expect(
      certVaultStatusObservation(
        { ...certificate, fingerprintSha256: null },
        new Map([["service-1", "different"]]),
      ),
    ).toBeUndefined();
  });

  it("distinguishes a known missing match from a failed CertVault lookup", () => {
    expect(certVaultStatusObservation(certificate, new Map())).toBeNull();
    expect(certVaultStatusObservation(certificate, null)).toBeUndefined();
  });
});
