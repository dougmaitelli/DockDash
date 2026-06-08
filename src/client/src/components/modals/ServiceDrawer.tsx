import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type { Service, UpdateServiceRequest } from "@shared";
import { ContainerAction, ServiceSource } from "@shared";

import { Icons } from "@/components/Icons";
import { cn } from "@/lib/utils";

import { useConfig } from "../../context/ConfigContext";
import { Changelog } from "../Changelog";
import { ContainerControls } from "../ContainerControls";
import { DockerLogs } from "../DockerLogs";
import { FileExplorer } from "../FileExplorer";
import { ServiceDetails } from "../ServiceDetails";
import { Terminal } from "../Terminal";
import { ConfirmDialog } from "./ConfirmDialog";

import "./ServiceDrawer.css";

const ANIM_MS = 220;

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
  const [currentTab, setCurrentTab] = useState<Tab>("details");
  const [logsReconnectTrigger, setLogsReconnectTrigger] = useState(0);

  const config = useConfig();
  const isDocker = service.source === ServiceSource.DOCKER;

  const handleContainerActionComplete = useCallback((action: ContainerAction) => {
    if (action === ContainerAction.START || action === ContainerAction.RESTART) {
      setTimeout(() => setLogsReconnectTrigger((n) => n + 1), 500);
    }
  }, []);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, ANIM_MS);
  };

  const tabs = {
    details: {
      label: t("modals.tabDetails"),
      dockerOnly: false,
      enabled: true,
      content: (
        <ServiceDetails
          service={service}
          onSave={onSave}
          onDelete={() => setConfirmingDelete(true)}
          onCancel={dismiss}
        />
      ),
    },
    changelog: {
      label: t("modals.tabChangelog"),
      dockerOnly: true,
      enabled: true,
      content: <Changelog serviceId={service.id!} />,
    },
    logs: {
      label: t("modals.tabLogs"),
      dockerOnly: true,
      enabled: true,
      content: <DockerLogs serviceId={service.id!} reconnectTrigger={logsReconnectTrigger} />,
    },
    files: {
      label: t("modals.tabFiles"),
      dockerOnly: true,
      enabled: config?.fileExplorerEnabled ?? false,
      content: <FileExplorer serviceId={service.id!} />,
    },
    terminal: {
      label: t("modals.tabTerminal"),
      dockerOnly: true,
      enabled: config?.terminalEnabled ?? false,
      content: <Terminal serviceId={service.id!} />,
    },
  };

  type Tab = keyof typeof tabs;

  const visibleTabIds = (Object.keys(tabs) as Tab[]).filter(
    (id) => (!tabs[id].dockerOnly || isDocker) && tabs[id].enabled,
  );
  const tab = (visibleTabIds.includes(currentTab as Tab) ? currentTab : visibleTabIds[0]) as Tab;

  const tabButtonClass = (active: boolean) =>
    cn(
      "border-b-2 border-x-0 border-t-0 -mb-px px-3.5 pt-2.5 pb-2 text-xs bg-transparent transition-colors",
      active
        ? "border-primary font-semibold text-foreground"
        : "border-transparent font-normal text-muted-foreground hover:text-foreground",
    );

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
          {visibleTabIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCurrentTab(id)}
              className={tabButtonClass(tab === id)}
            >
              {tabs[id].label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">{tabs[tab].content}</div>
      </div>
    </>,
    document.body,
  );
}
