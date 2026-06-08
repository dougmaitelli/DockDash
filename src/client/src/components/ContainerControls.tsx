import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service } from "@shared";
import { ContainerAction, ServiceStatus } from "@shared";

import { Icons } from "@/components/Icons";
import { Button } from "@/components/ui/Button";
import { serviceApi } from "@/services/api";

const tabClass =
  "rounded-t-none rounded-b-md h-7 w-10 disabled:opacity-20 disabled:cursor-not-allowed";

interface ContainerControlsProps {
  service: Service;
  onActionComplete?: (action: ContainerAction) => void;
}

export function ContainerControls({ service, onActionComplete }: ContainerControlsProps) {
  const { t } = useTranslation();
  const [activeAction, setActiveAction] = useState<ContainerAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = useCallback(
    async (action: ContainerAction) => {
      setActiveAction(action);
      setError(null);

      try {
        await serviceApi.containerAction(service.id!, action);
        onActionComplete?.(action);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setActiveAction(null);
      }
    },
    [service.id, onActionComplete],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-px">
        <Button
          variant="destructive"
          onClick={() => handleAction(ContainerAction.STOP)}
          disabled={activeAction !== null || service.status !== ServiceStatus.UP}
          title={t("modals.containerStop")}
          className={tabClass}
        >
          <Icons.Stop size={13} />
        </Button>
        <Button
          onClick={() => handleAction(ContainerAction.START)}
          disabled={activeAction !== null || service.status !== ServiceStatus.DOWN}
          title={t("modals.containerStart")}
          className={`${tabClass} bg-success text-success-foreground hover:bg-success/90`}
        >
          <Icons.Play size={13} />
        </Button>
        <Button
          onClick={() => handleAction(ContainerAction.RESTART)}
          disabled={activeAction !== null || service.status !== ServiceStatus.UP}
          title={t("modals.containerRestart")}
          className={`${tabClass} bg-warning text-warning-foreground hover:bg-warning/90`}
        >
          <Icons.Refresh size={13} />
        </Button>
      </div>
      {error && (
        <span
          className="text-[0.7rem] text-destructive max-w-[220px] whitespace-nowrap overflow-hidden text-ellipsis"
          title={error}
        >
          {t("modals.containerActionFailed", { error })}
        </span>
      )}
    </div>
  );
}
