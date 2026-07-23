import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
  head: vi.fn(),
}));
const mockFetchRegistryToken = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("axios", () => ({ default: mockAxios }));

vi.mock("@server/services/registry/auth.js", () => ({
  fetchRegistryToken: mockFetchRegistryToken,
}));

const { registryClient } = await import("@server/services/registryClient.js");

describe("RegistryClient.parseImageRef", () => {
  it("expands a bare image name to Docker Hub library namespace", () => {
    const ref = registryClient.parseImageRef("nginx");

    expect(ref.registry).toBe("registry-1.docker.io");
    expect(ref.repository).toBe("library/nginx");
    expect(ref.tag).toBe("latest");
  });

  it("handles a user-scoped Docker Hub image with a tag", () => {
    const ref = registryClient.parseImageRef("user/app:v1.0");

    expect(ref.registry).toBe("registry-1.docker.io");
    expect(ref.repository).toBe("user/app");
    expect(ref.tag).toBe("v1.0");
  });

  it("handles a GHCR image", () => {
    const ref = registryClient.parseImageRef("ghcr.io/owner/repo:sha-abc");

    expect(ref.registry).toBe("ghcr.io");
    expect(ref.repository).toBe("owner/repo");
    expect(ref.tag).toBe("sha-abc");
  });

  it("handles a custom registry with explicit port", () => {
    const ref = registryClient.parseImageRef("registry.example.com:5000/myapp:latest");

    expect(ref.registry).toBe("registry.example.com:5000");
    expect(ref.repository).toBe("myapp");
    expect(ref.tag).toBe("latest");
  });

  it("strips the digest suffix and keeps the tag", () => {
    const ref = registryClient.parseImageRef("nginx:1.25@sha256:deadbeef");

    expect(ref.repository).toBe("library/nginx");
    expect(ref.tag).toBe("1.25");
  });

  it("defaults tag to 'latest' when no colon in last segment", () => {
    const ref = registryClient.parseImageRef("ghcr.io/owner/repo");

    expect(ref.tag).toBe("latest");
  });
});

describe("RegistryClient.getManifestDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRegistryToken.mockResolvedValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  const ref = { registry: "registry-1.docker.io", repository: "library/nginx", tag: "latest" };

  it("returns the digest from a successful HEAD response", async () => {
    mockAxios.head.mockResolvedValue({
      status: 200,
      headers: { "docker-content-digest": "sha256:abc123" },
    });

    const digest = await registryClient.getManifestDigest(ref);

    expect(digest).toBe("sha256:abc123");
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it("falls back to GET when HEAD is not supported (throws)", async () => {
    mockAxios.head.mockRejectedValue(new Error("Method Not Allowed"));
    mockAxios.get.mockResolvedValue({
      status: 200,
      headers: { "docker-content-digest": "sha256:fallback" },
    });

    const digest = await registryClient.getManifestDigest(ref);

    expect(digest).toBe("sha256:fallback");
  });

  it("falls back to GET when HEAD returns a non-200 status", async () => {
    mockAxios.head.mockResolvedValue({ status: 405, headers: {} });
    mockAxios.get.mockResolvedValue({
      status: 200,
      headers: { "docker-content-digest": "sha256:from-get" },
    });

    const digest = await registryClient.getManifestDigest(ref);

    expect(digest).toBe("sha256:from-get");
  });

  it("returns null when GET also returns non-200", async () => {
    mockAxios.head.mockResolvedValue({ status: 404, headers: {} });
    mockAxios.get.mockResolvedValue({ status: 404, headers: {} });

    const digest = await registryClient.getManifestDigest(ref);

    expect(digest).toBeNull();
  });

  it("returns null when successful responses omit the digest header", async () => {
    mockAxios.head.mockResolvedValue({ status: 200, headers: {} });

    await expect(registryClient.getManifestDigest(ref)).resolves.toBeNull();
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it("adds registry authentication to manifest requests", async () => {
    mockFetchRegistryToken.mockResolvedValue("registry-token");
    mockAxios.head.mockResolvedValue({
      status: 200,
      headers: { "docker-content-digest": "sha256:secured" },
    });

    await registryClient.getManifestDigest(ref);

    expect(mockAxios.head).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer registry-token" }),
      }),
    );
  });

  it("returns null and does not throw when the request fails entirely", async () => {
    mockAxios.head.mockRejectedValue(new Error("timeout"));
    mockAxios.get.mockRejectedValue(new Error("timeout"));

    await expect(registryClient.getManifestDigest(ref)).resolves.toBeNull();
  });
});

describe("RegistryClient.getRepositoryTags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the generic provider for an unknown registry", async () => {
    const ref = { registry: "custom.registry.io", repository: "myapp", tag: "latest" };

    mockAxios.get.mockResolvedValue({
      status: 200,
      headers: {},
      data: { tags: ["1.0.0", "1.1.0", "latest"] },
    });

    const tags = await registryClient.getRepositoryTags(ref, "");

    expect(tags).toContain("1.0.0");
    expect(tags).toContain("1.1.0");
  });

  it("returns an empty array and does not throw when the provider throws", async () => {
    const ref = { registry: "failing.registry.io", repository: "app", tag: "latest" };

    mockAxios.get.mockRejectedValue(new Error("connection refused"));

    await expect(registryClient.getRepositoryTags(ref, "")).resolves.toEqual([]);
  });
});
