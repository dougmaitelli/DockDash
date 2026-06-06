import { useState, Fragment, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Service } from "@shared";
import { ServiceSource, ContainerAction } from "@shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/NumberInput";
import { Input } from "@/components/ui/Input";
import { NumberTagArrayInput } from "@/components/TagArrayInput";
import { Icons } from "@/components/Icons";
import { FormGroup, Label } from "./BaseModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { HealthHistoryGraph } from "../HealthHistoryGraph";
import { DockerLogs } from "../DockerLogs";
import { Changelog } from "../Changelog";
import { FileExplorer } from "../FileExplorer";
import { ContainerControls } from "../ContainerControls";
import { useConfig } from "../../context/ConfigContext";

const ANIM_MS = 220;

type Tab = "details" | "logs" | "changelog" | "files";

interface ServiceDrawerProps {
  service: Service;
  onSave: (data: Pick<Service, "name" | "host" | "ports" | "checkPort">) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ServiceDrawer({ service, onSave, onDelete, onClose }: ServiceDrawerProps) {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [editName, setEditName] = useState(service.name);
  const [editHost, setEditHost] = useState(service.host);
  const [editPorts, setEditPorts] = useState<number[]>(service.ports ?? []);
  const [editCheckPort, setEditCheckPort] = useState(service.checkPort?.toString() ?? "");
  const [metadataExpanded, setMetadataExpanded] = useState(false);

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

  const metadataEntries = service.metadata
    ? Object.entries(service.metadata).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
      }))
    : [];

  const handlePortsChange = (vals: string[]) => {
    setEditPorts(vals.map(Number).sort((a, b) => a - b));
  };

  const validatePort = (value: string, existing: string[]) => {
    const n = parseInt(value, 10);

    if (isNaN(n) || n < 1 || n > 65535) return t("modals.portsInvalidPort");

    if (existing.includes(value)) return t("modals.portsDuplicate");

    return null;
  };

  const handleSave = () => {
    const checkPort = parseInt(editCheckPort, 10);

    onSave({
      name: editName,
      host: editHost,
      ports: editPorts,
      checkPort: isNaN(checkPort) ? null : checkPort,
    });
  };

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
          <button
            type="button"
            onClick={() => setTab("details")}
            className={tabButtonClass(tab === "details")}
          >
            {t("modals.tabDetails")}
          </button>
          {isDocker && (
            <button
              type="button"
              onClick={() => setTab("changelog")}
              className={tabButtonClass(tab === "changelog")}
            >
              {t("modals.tabChangelog")}
            </button>
          )}
          {isDocker && (
            <button
              type="button"
              onClick={() => setTab("logs")}
              className={tabButtonClass(tab === "logs")}
            >
              {t("modals.tabLogs")}
            </button>
          )}
          {isDocker && (
            <button
              type="button"
              onClick={() => setTab("files")}
              className={tabButtonClass(tab === "files")}
            >
              {t("modals.tabFiles")}
            </button>
          )}
        </div>

        {tab === "details" ? (
          <div className="flex-1 overflow-y-auto flex flex-col p-5">
            <HealthHistoryGraph serviceId={service.id!} />

            <FormGroup>
              <Label>{t("modals.name")}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("modals.namePlaceholder")}
              />
            </FormGroup>
            <FormGroup>
              <Label>{t("modals.host")}</Label>
              <Input
                value={editHost}
                onChange={(e) => setEditHost(e.target.value)}
                placeholder={t("modals.hostPlaceholder")}
              />
            </FormGroup>
            <FormGroup>
              <Label>{t("modals.ports")}</Label>
              <NumberTagArrayInput
                values={editPorts.map(String)}
                onChange={handlePortsChange}
                validate={validatePort}
                min={1}
                max={65535}
                formatTag={(v) => `:${v}`}
                placeholder={t("modals.portsPlaceholder")}
              />
            </FormGroup>
            {!isDocker && (
              <FormGroup>
                <Label>{t("modals.checkPort")}</Label>
                <NumberInput
                  value={editCheckPort}
                  onChange={(e) => setEditCheckPort(e.target.value)}
                  placeholder={t("modals.checkPortPlaceholder")}
                />
              </FormGroup>
            )}

            {metadataEntries.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setMetadataExpanded((v) => !v)}
                  className="flex items-center gap-1.5 w-full bg-transparent border-none py-2 text-muted-foreground text-xs uppercase tracking-wide hover:text-secondary-foreground"
                >
                  <span>{metadataExpanded ? "▾" : "▸"}</span>
                  {t("modals.metadata")}
                </button>
                {metadataExpanded && (
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-2 px-3 bg-background rounded-md mb-3.5">
                    {metadataEntries.map(({ key, value }) => (
                      <Fragment key={key}>
                        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {key}
                        </span>
                        <span className="text-xs text-secondary-foreground break-all">{value}</span>
                      </Fragment>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : tab === "logs" ? (
          <div className="flex-1 overflow-y-auto flex flex-col pt-4 px-5">
            <DockerLogs serviceId={service.id!} reconnectTrigger={logsReconnectTrigger} />
          </div>
        ) : tab === "changelog" ? (
          <div className="flex-1 overflow-y-auto flex flex-col pt-4 px-5">
            <Changelog serviceId={service.id!} />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col pt-4 px-5">
            <FileExplorer serviceId={service.id!} />
          </div>
        )}

        {tab === "details" && (
          <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-border">
            <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
              {t("modals.delete")}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={dismiss}>
                {t("modals.cancel")}
              </Button>
              <Button variant="default" onClick={handleSave}>
                {t("modals.save")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
