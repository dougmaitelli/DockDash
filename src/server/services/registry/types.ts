export const REQUEST_TIMEOUT = 8_000;

// Accept header that prefers manifest lists (multi-arch) over single-platform manifests.
// The digest from a manifest list is the stable "pull digest" shown by `docker pull`.
export const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
].join(",");

export interface ImageRef {
  registry: string;
  repository: string;
  tag: string;
}

export interface RegistryProvider {
  getRepositoryTags(ref: ImageRef, prefix: string): Promise<string[]>;
}
