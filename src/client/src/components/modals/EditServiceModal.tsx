import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service } from "@shared";
import { ServiceSource } from "@shared";

import { Icons } from "@/components/Icons";
import { NumberInput } from "@/components/NumberInput";
import { NumberTagArrayInput } from "@/components/TagArrayInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormValidation } from "@/hooks/useFormValidation";

import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";

interface EditServiceModalProps {
  service?: Service;
  onSave: (data: Pick<Service, "name" | "host" | "ports" | "checkPort">) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function EditServiceModal({ service, onSave, onDelete, onCancel }: EditServiceModalProps) {
  const { t } = useTranslation();
  const [editNodeName, setEditNodeName] = useState(service?.name ?? "");
  const [editNodeHost, setEditNodeHost] = useState(service?.host ?? "");
  const [editPorts, setEditPorts] = useState<number[]>(service?.ports ?? []);
  const [editCheckPort, setEditCheckPort] = useState(service?.checkPort?.toString() ?? "");
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const { errors, validate, clearError } = useFormValidation({
    name: { required: t("modals.nameRequired") },
    host: { required: t("modals.hostRequired") },
    checkPort: {
      custom: (v) => {
        const n = parseInt(v, 10);

        return v.trim() && (isNaN(n) || n < 1 || n > 65535) ? t("modals.portsInvalidPort") : null;
      },
    },
  });

  const metadataEntries = service?.metadata
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

  const handleConfirm = () => {
    if (!validate({ name: editNodeName, host: editNodeHost, checkPort: editCheckPort })) return;

    const checkPort = parseInt(editCheckPort, 10);

    onSave({
      name: editNodeName,
      host: editNodeHost,
      ports: editPorts,
      checkPort: isNaN(checkPort) ? null : checkPort,
    });
  };

  return (
    <BaseModal
      title={service ? t("modals.editServiceTitle") : t("modals.addServiceTitle")}
      onClose={onCancel}
      width={400}
      actions={
        <ModalActions>
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              {t("modals.delete")}
            </Button>
          )}
          <ModalActionsRight>
            <Button variant="outline" onClick={onCancel}>
              {t("modals.cancel")}
            </Button>
            <Button variant="default" onClick={handleConfirm}>
              {service ? t("modals.save") : t("modals.add")}
            </Button>
          </ModalActionsRight>
        </ModalActions>
      }
    >
      {service && (
        <div className="text-sm text-secondary-foreground mb-4 py-2.5 px-3 bg-background rounded-md">
          <div className="flex items-center gap-2">
            {service.source === ServiceSource.DOCKER ? (
              <Icons.Docker size={20} className="text-muted-foreground" />
            ) : (
              <Icons.Globe size={20} className="text-muted-foreground" />
            )}
            <div>
              <div className="font-semibold text-foreground">{service.name}</div>
              <div className="text-[0.7rem] text-muted-foreground font-mono mt-1">{service.id}</div>
            </div>
          </div>
        </div>
      )}
      <FormGroup error={errors.name}>
        <Label>{t("modals.name")}</Label>
        <Input
          value={editNodeName}
          onChange={(e) => {
            setEditNodeName(e.target.value);
            clearError("name");
          }}
          placeholder={t("modals.namePlaceholder")}
        />
      </FormGroup>
      <FormGroup error={errors.host}>
        <Label>{t("modals.host")}</Label>
        <Input
          value={editNodeHost}
          onChange={(e) => {
            setEditNodeHost(e.target.value);
            clearError("host");
          }}
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
      <FormGroup error={errors.checkPort}>
        <Label>{t("modals.checkPort")}</Label>
        <NumberInput
          value={editCheckPort}
          onChange={(e) => {
            setEditCheckPort(e.target.value);
            clearError("checkPort");
          }}
          placeholder={t("modals.checkPortPlaceholder")}
        />
      </FormGroup>
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
    </BaseModal>
  );
}
