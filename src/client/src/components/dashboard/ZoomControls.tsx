import { useTranslation } from "react-i18next";
import { Icons } from "@/components/Icons";
import { Button } from "@/components/ui/Button";

interface ZoomControlsProps {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function ZoomControls({
  zoom,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: ZoomControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 z-10 pointer-events-auto">
      <Button
        variant="outline"
        size="icon"
        onClick={onZoomIn}
        disabled={zoom >= maxZoom}
        title={t("dashboard.zoom.in")}
      >
        <Icons.Plus size={16} />
      </Button>
      <span className="text-[0.7rem] font-semibold text-text-light min-w-8 text-center tracking-[0.3px]">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={onZoomOut}
        disabled={zoom <= minZoom}
        title={t("dashboard.zoom.out")}
      >
        <Icons.Minus size={16} />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={onFit}
        title={t("dashboard.zoom.fit")}
        className="mt-1"
      >
        <Icons.FitView size={16} />
      </Button>
    </div>
  );
}
