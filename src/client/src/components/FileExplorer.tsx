import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { serviceApi } from "@/services/api";
import { Icons } from "@/components/Icons";
import type { FileEntry } from "@shared";

interface FileExplorerProps {
  serviceId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

export function FileExplorer({ serviceId }: FileExplorerProps) {
  const { t } = useTranslation();
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPath = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await serviceApi.listFiles(serviceId, p);
        setEntries(res.data.entries);
        setPath(res.data.path);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
        setError(axiosErr.response?.data?.error ?? axiosErr.message ?? String(err));
      } finally {
        setLoading(false);
      }
    },
    [serviceId],
  );

  useEffect(() => {
    loadPath("/");
  }, [loadPath]);

  const navigate = (name: string) => {
    loadPath(path === "/" ? `/${name}` : `${path}/${name}`);
  };

  const navigateUp = () => {
    const parent = path.split("/").slice(0, -1).join("/") || "/";
    loadPath(parent);
  };

  const navigateTo = (index: number) => {
    if (index === 0) {
      loadPath("/");
    } else {
      const parts = path.split("/").filter(Boolean);
      loadPath("/" + parts.slice(0, index).join("/"));
    }
  };

  const breadcrumbParts = path === "/" ? [] : path.split("/").filter(Boolean);

  const sorted = [...entries].sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 text-xs font-mono bg-background border border-border rounded-md flex-wrap min-h-8">
        <button
          type="button"
          onClick={() => navigateTo(0)}
          className={cn(
            "bg-transparent border-none p-0 text-xs font-mono",
            breadcrumbParts.length === 0
              ? "text-foreground font-semibold"
              : "text-primary hover:underline",
          )}
        >
          /
        </button>
        {breadcrumbParts.map((part, i) => {
          const isLast = i === breadcrumbParts.length - 1;
          return (
            <span key={i} className="flex items-center gap-0.5">
              <span className="text-muted-foreground px-0.5">/</span>
              {isLast ? (
                <span className="text-foreground font-semibold">{part}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateTo(i + 1)}
                  className="bg-transparent border-none p-0 text-xs font-mono text-primary hover:underline"
                >
                  {part}
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Content */}
      {loading && (
        <div className="text-xs text-muted-foreground text-center py-8">
          {t("modals.filesLoading")}
        </div>
      )}

      {error && !loading && (
        <div className="text-xs text-destructive py-4 px-1 break-all">{error}</div>
      )}

      {!loading && !error && (
        <div className="flex-1 overflow-y-auto">
          {path !== "/" && (
            <button
              type="button"
              onClick={navigateUp}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-muted-foreground hover:bg-primary/5 rounded cursor-pointer bg-transparent border-none text-left"
            >
              <Icons.ChevronUp size={13} className="shrink-0" />
              <span>..</span>
            </button>
          )}

          {sorted.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">
              {t("modals.filesEmpty")}
            </div>
          )}

          {sorted.map((entry) => (
            <div
              key={entry.name}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono",
                entry.type === "directory"
                  ? "cursor-pointer hover:bg-primary/5"
                  : "cursor-default",
              )}
              onClick={() => entry.type === "directory" && navigate(entry.name)}
            >
              {entry.type === "directory" ? (
                <Icons.Folder size={13} className="text-warning shrink-0" />
              ) : entry.type === "symlink" ? (
                <Icons.ArrowRight size={13} className="text-accent-cyan shrink-0" />
              ) : (
                <Icons.File size={13} className="text-muted-foreground shrink-0" />
              )}

              <span
                className={cn(
                  "flex-1 truncate",
                  entry.type === "directory" ? "text-foreground" : "text-secondary-foreground",
                )}
              >
                {entry.name}
              </span>

              {entry.type !== "directory" && (
                <span className="text-muted-foreground text-[0.6rem] shrink-0 tabular-nums">
                  {formatSize(entry.size)}
                </span>
              )}

              <span className="text-muted-foreground text-[0.6rem] shrink-0 hidden sm:block">
                {entry.permissions}
              </span>

              <span className="text-muted-foreground text-[0.6rem] shrink-0 hidden md:block">
                {entry.modified}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
