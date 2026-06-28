import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Icons } from "@/components/Icons";
import { Button } from "@/components/ui/Button";

export function EmptyOverlay() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-[50] flex flex-col items-center justify-center gap-3 text-muted-foreground text-[0.9rem] bg-black/50 backdrop-blur-[2px]">
      <Icons.Server size={48} style={{ opacity: 0.3 }} />
      <span>{t("dashboard.emptyMessage")}</span>
      <Button variant="default" onClick={() => navigate("/services")}>
        <Icons.Server size={14} />
        {t("dashboard.goToServices")}
      </Button>
    </div>
  );
}
