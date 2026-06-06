import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Service, UpdateServiceRequest } from "@shared";
import { ServiceSource, ContainerAction } from "@shared";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/Icons";
import { ConfirmDialog } from "./ConfirmDialog";
import { DockerLogs } from "../DockerLogs";
import { Changelog } from "../Changelog";
import { FileExplorer } from "../FileExplorer";
import { ServiceDetails } from "../ServiceDetails";
import { ContainerControls } from "../ContainerControls";
import { useConfig } from "../../context/ConfigContext";

const ANIM_MS = 220;

type Tab = "details" | "logs" | "changelog" | "files";

interface ServiceDrawerProps {
  service: Service;
  onSave: (data: UpdateServiceRequest) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ServiceDrawer({ service, onSave, onDelete, onClose }: ServiceDrawerProps) {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useState<Tab>("details");

  const config = useConfig();
  const isDocker = service.source === ServiceSource.DOCKER;
  const [logsReconnectTrigger, setLogsReconnectTrigger] = useState(0);

  const handleContainerActionComplete = useCallback((action: ContainerAction) => {
    if (action === ContainerAction.START || action === ContainerAction.RESTART) {
      setTimeout(() => setLogsReconnectTrigger((n) => n + 1), 500);
    }
  }, []);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, ANIM_MS);
  };

  const tabButtonClass = (active: boolean) =>
    cn(
      "border-b-2 border-x-0 border-t-0 -mb-px px-3.5 pt-2.5 pb-2 text-xs bg-transparent transition-colors",
      active
        ? "border-primary font-semibold text-foreground"
        : "border-transparent font-normal text-muted-foreground hover:text-foreground",
    );

  const tabs = [
    {
      id: "details" as Tab,
      label: t("modals.tabDetails"),
      dockerOnly: false,
      content: (
        <ServiceDetails
          service={service}
          onSave={onSave}
          onDelete={() => setConfirmingDelete(true)}
          onCancel={dismiss}
        />
      ),
    },
    {
      id: "changelog" as Tab,
      label: t("modals.tabChangelog"),
      dockerOnly: true,
      content: <Changelog serviceId={service.id!} />,
    },
    {
      id: "logs" as Tab,
      label: t("modals.tabLogs"),
      dockerOnly: true,
      content: <DockerLogs serviceId={service.id!} reconnectTrigger={logsReconnectTrigger} />,
    },
    {
      id: "files" as Tab,
      label: t("modals.tabFiles"),
      dockerOnly: true,
      content: <FileExplorer serviceId={service.id!} />,
    },
  ];

  const visibleTabs = tabs.filter((t) => !t.dockerOnly || isDocker);
  const activeTab = visibleTabs.find((t) => t.id === tab) ?? visibleTabs[0];

  return createPortal(
    <>
      {confirmingDelete && (
        <ConfirmDialog
          message={t("modals.confirmDeleteService")}
          onConfirm={() => {
            setConfirmingDelete(false);
            dismiss();
            setTimeout(onDelete, ANIM_MS);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      <div
        className="fixed left-0 top-0 h-full flex flex-col border-r border-border z-[101] bg-muted"
        style={{
          width: tab !== "details" ? 900 : 600,
          animation: `${closing ? "slideOutDrawer" : "slideInDrawer"} ${ANIM_MS}ms ease both`,
          transition: `width ${ANIM_MS}ms ease`,
          boxShadow: "6px 0 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div className="border-b border-border relative">
          {isDocker && config?.containerControlsEnabled && (
            <div className="absolute top-0 right-15 flex">
              <ContainerControls
                service={service}
                onActionComplete={handleContainerActionComplete}
              />
            </div>
          )}
          <div className="flex items-start gap-2.5 px-5 pb-4 pt-3">
            {isDocker ? (
              <Icons.Docker size={18} className="text-muted-foreground mt-0.5 shrink-0" />
            ) : (
              <Icons.Globe size={18} className="text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[0.95rem] font-semibold text-foreground truncate">
                {service.name}
              </div>
              <div className="text-[0.65rem] text-muted-foreground font-mono mt-0.5 truncate">
                {service.id}
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="bg-transparent border-none text-muted-foreground p-0.5 flex items-center shrink-0 hover:text-foreground"
            >
              <Icons.X size={16} />
            </button>
          </div>
        </div>

        <div className="flex border-b border-border px-5">
          {visibleTabs.map((tabDef) => (
            <button
              key={tabDef.id}
              type="button"
              onClick={() => setTab(tabDef.id)}
              className={tabButtonClass(tab === tabDef.id)}
            >
              {tabDef.label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">{activeTab.content}</div>
      </div>
    </>,
    document.body,
  );
}
