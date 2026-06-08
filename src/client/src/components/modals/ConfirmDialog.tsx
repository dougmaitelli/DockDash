import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-card border border-border rounded-[10px] p-6 w-[340px] shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[0.9rem] text-secondary-foreground mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("modals.cancel")}
          </Button>
          <Button variant="destructive" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel ?? t("modals.delete")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
