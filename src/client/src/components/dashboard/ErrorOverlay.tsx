import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

interface ErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

export function ErrorOverlay({ message, onRetry }: ErrorOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-[50] flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-2.5 px-9 py-7 bg-card border border-destructive rounded-xl text-center max-w-[420px]">
        <p className="text-[0.95rem] font-semibold text-foreground">{t("dashboard.errorTitle")}</p>
        <p className="text-[0.8rem] text-muted-foreground break-words">{message}</p>
        <Button variant="destructive" onClick={onRetry}>
          {t("dashboard.retry")}
        </Button>
      </div>
    </div>
  );
}
