const SEMVER_RE = /(\d+\.\d+\.\d+(?:\.\d+)?)/;

export interface ParsedTag {
  version: string;
  prefix: string;
  suffix: string;
  parts: number[];
}

export class TagParser {
  static extractSemVer(tag: string): ParsedTag | null {
    const match = SEMVER_RE.exec(tag);

    if (!match) return null;

    const version = match[1];
    const prefix = tag.slice(0, match.index);
    const suffix = tag.slice(match.index + version.length);
    const parts = version.split(".").map(Number);

    return { version, prefix, suffix, parts };
  }

  static compareSemVer(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);

      if (diff !== 0) return diff;
    }

    return 0;
  }
}
