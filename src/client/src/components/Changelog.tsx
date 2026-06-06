import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkEmoji from "remark-emoji";
import { serviceApi } from "@/services/api";
import type { ChangelogResponse } from "@shared";

interface ChangelogProps {
  serviceId: string;
}

export function Changelog({ serviceId }: ChangelogProps) {
  const [data, setData] = useState<ChangelogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    serviceApi
      .getChangelog(serviceId)
      .then((res) => setData(res.data))
      .catch(() => setData({ available: false, reason: "Failed to fetch changelog" }))
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) {
    return <div className="text-[0.82rem] text-muted-foreground text-center py-5">Loading…</div>;
  }

  if (!data || !data.available) {
    return (
      <div className="text-[0.82rem] text-muted-foreground text-center py-5">
        {data?.reason ?? "Changelog not available"}
      </div>
    );
  }

  const { release } = data;

  return (
    <div className="flex flex-col gap-3 p-5 flex-1">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 text-primary">
          {release.version}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(release.publishedAt).toLocaleDateString()}
        </span>
        <a
          href={release.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary no-underline hover:underline ml-auto"
        >
          View on GitHub ↗
        </a>
      </div>
      <div className="changelog-body">
        <ReactMarkdown remarkPlugins={[remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
          {release.body || "_No release notes provided._"}
        </ReactMarkdown>
      </div>
    </div>
  );
}
