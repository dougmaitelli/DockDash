import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service } from "@shared";

import { Icons } from "@/components/Icons";

interface UpdatesPopoverProps {
  services: Service[];
  onSelect: (service: Service) => void;
}

export function UpdatesPopover({ services, onSelect }: UpdatesPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        <span className="text-[0.85rem] text-warning font-semibold">{services.length}</span>
        <span className="text-[0.75rem] text-muted-foreground">{t("dashboard.updates")}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 min-w-64 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("dashboard.availableUpdates")}
            </span>
          </div>
          <ul className="py-1 max-h-72 overflow-y-auto">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  className="w-full flex items-center justify-between gap-4 px-3 py-2 text-left hover:bg-primary/5 transition-colors"
                  onClick={() => {
                    onSelect(s);
                    setOpen(false);
                  }}
                >
                  <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <span className="font-mono">{s.metadata?.imageTag ?? "—"}</span>
                    <Icons.ArrowRight size={11} />
                    <span className="font-mono text-warning">
                      {s.metadata?.latestVersion ?? "—"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
