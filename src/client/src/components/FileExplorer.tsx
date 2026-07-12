import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FileEntry } from "@shared";

import { Icons } from "@/components/Icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { serviceApi } from "@/services/api";

interface FileExplorerProps {
  serviceId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;

  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;

  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

function isBinary(content: string): boolean {
  return content.includes("\0");
}

export function FileExplorer({ serviceId }: FileExplorerProps) {
  const { t } = useTranslation();

  // Directory listing state
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File editor state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loadedContent, setLoadedContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = loadedContent !== null && editContent !== loadedContent;

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

  const openFile = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);
      setLoadedContent(null);
      setEditContent("");
      setFileError(null);
      setFileLoading(true);
      setSaved(false);
      try {
        const res = await serviceApi.readFileContent(serviceId, filePath);

        setLoadedContent(res.data.content);
        setEditContent(res.data.content);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };

        setFileError(axiosErr.response?.data?.error ?? axiosErr.message ?? String(err));
      } finally {
        setFileLoading(false);
      }
    },
    [serviceId],
  );

  const saveFile = async () => {
    if (!selectedFile) return;

    setSaving(true);
    setSaved(false);
    try {
      await serviceApi.writeFileContent(serviceId, selectedFile, editContent);
      setLoadedContent(editContent);
      setSaved(true);

      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };

      setFileError(axiosErr.response?.data?.error ?? axiosErr.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const closeFile = () => {
    setSelectedFile(null);
    setLoadedContent(null);
    setEditContent("");
    setFileError(null);
    setSaved(false);
  };

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

  const selectedFilename = selectedFile?.split("/").pop() ?? "";

  return (
    <div className="flex h-full gap-3 pt-4 px-5">
      {/* Left: file tree */}
      <div className={cn("flex flex-col gap-3 min-w-0", selectedFile ? "w-64 shrink-0" : "flex-1")}>
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

        {/* Directory contents */}
        {loading && (
          <div className="text-xs text-muted-foreground text-center py-8">
            {t("drawer.files.loading")}
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
                {t("drawer.files.empty")}
              </div>
            )}

            {sorted.map((entry) => {
              const filePath = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
              const isSelected = selectedFile === filePath;

              return (
                <div
                  key={entry.name}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono cursor-pointer",
                    isSelected ? "bg-primary/10 text-foreground" : "hover:bg-primary/5",
                  )}
                  onClick={() =>
                    entry.type === "directory" ? navigate(entry.name) : openFile(filePath)
                  }
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

                  {entry.type !== "directory" && !selectedFile && (
                    <span className="text-muted-foreground text-[0.6rem] shrink-0 tabular-nums">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: file editor */}
      {selectedFile && (
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-background border border-border rounded-md min-h-8">
            <span className="text-xs font-mono text-foreground font-semibold truncate">
              {selectedFilename}
            </span>
            <button
              type="button"
              onClick={closeFile}
              className="bg-transparent border-none text-muted-foreground hover:text-foreground shrink-0"
            >
              <Icons.X size={13} />
            </button>
          </div>

          {/* Content area */}
          {fileLoading && (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              {t("drawer.files.contentLoading")}
            </div>
          )}

          {fileError && !fileLoading && (
            <div className="flex-1 flex items-start pt-4 px-1">
              <span className="text-xs text-destructive break-all">{fileError}</span>
            </div>
          )}

          {!fileLoading && !fileError && loadedContent !== null && isBinary(loadedContent) && (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              {t("drawer.files.binary")}
            </div>
          )}

          {!fileLoading && !fileError && loadedContent !== null && !isBinary(loadedContent) && (
            <>
              <textarea
                className="flex-1 min-h-0 w-full font-mono text-xs bg-background border border-border rounded-md px-3 py-2.5 resize-none text-secondary-foreground focus:outline-none focus:border-primary"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
              />
              <div className="flex items-center justify-end gap-2 shrink-0 pb-4">
                {saved && (
                  <span className="text-xs text-success flex items-center gap-1">
                    <Icons.Check size={12} />
                    {t("drawer.files.saved")}
                  </span>
                )}
                <Button variant="default" onClick={saveFile} disabled={saving || !isDirty}>
                  {saving ? t("drawer.files.saving") : t("drawer.files.save")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
