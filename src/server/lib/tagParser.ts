const SEMVER_RE = /(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/;

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

  // Treats "" and "v" as the same prefix — projects often add/drop the "v" between releases.
  static prefixMatches(a: string, b: string): boolean {
    const norm = (p: string) => (p === "v" ? "" : p);

    return norm(a) === norm(b);
  }

  static compareSemVer(a: ParsedTag, b: ParsedTag): number;
  static compareSemVer(a: string, b: string): number;
  static compareSemVer(a: ParsedTag | string, b: ParsedTag | string): number {
    const pa = typeof a === "string" ? TagParser.extractSemVer(a) : a;
    const pb = typeof b === "string" ? TagParser.extractSemVer(b) : b;

    if (!pa || !pb) return 0;

    for (let i = 0; i < Math.max(pa.parts.length, pb.parts.length); i++) {
      const diff = (pa.parts[i] ?? 0) - (pb.parts[i] ?? 0);

      if (diff !== 0) return diff;
    }

    return 0;
  }
}
