import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CertVaultCertificate, Service } from "@shared";
import { isContainerService } from "@shared";
import type { UpdateServiceRequest } from "@shared/requestSchemas.js";

import { NumberInput } from "@/components/NumberInput";
import { NumberTagArrayInput } from "@/components/TagArrayInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useConfig } from "@/context/ConfigContext";
import { useFormValidation } from "@/hooks/useFormValidation";
import { certificateApi } from "@/services/api";

import { CertificateSummary } from "./CertificateSummary";
import { ContainerResourceMonitor } from "./ContainerResourceMonitor";
import { HealthHistoryGraph } from "./HealthHistoryGraph";
import { FormGroup, Label } from "./modals/BaseModal";

interface ServiceDetailsProps {
  service: Service;
  onSave: (data: UpdateServiceRequest) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function ServiceDetails({ service, onSave, onDelete, onCancel }: ServiceDetailsProps) {
  const isContainer = isContainerService(service);
  const { t } = useTranslation();
  const config = useConfig();
  const [editName, setEditName] = useState(service.name);
  const [editHost, setEditHost] = useState(service.host);
  const [editPorts, setEditPorts] = useState<number[]>(service.ports ?? []);
  const [editCheckPort, setEditCheckPort] = useState(service.checkPort?.toString() ?? "");
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [certificates, setCertificates] = useState<CertVaultCertificate[]>([]);
  const [certificateError, setCertificateError] = useState<string | null>(null);
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

  const metadataEntries = service.metadata
    ? Object.entries(service.metadata).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
      }))
    : [];

  useEffect(() => {
    setCertificates([]);
    setCertificateError(null);

    if (!config?.certVaultConfigured) return;

    let cancelled = false;

    certificateApi
      .getForService(service.id!)
      .then(({ data }) => !cancelled && setCertificates(data))
      .catch((err: unknown) => {
        if (!cancelled) setCertificateError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [config?.certVaultConfigured, service.id]);

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
    if (!validate({ name: editName, host: editHost, checkPort: editCheckPort })) return;

    const checkPort = parseInt(editCheckPort, 10);

    onSave({
      name: editName,
      host: editHost,
      ports: editPorts,
      checkPort: isNaN(checkPort) ? null : checkPort,
    });
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto flex flex-col p-5">
        {(config?.healthHistoryEnabled ?? true) && <HealthHistoryGraph serviceId={service.id!} />}

        {config?.certVaultConfigured && (certificates.length > 0 || certificateError) && (
          <div className="mb-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("certificates.protectingService")}
            </p>
            {certificateError ? (
              <p className="text-xs text-destructive">{certificateError}</p>
            ) : (
              certificates.map((certificate) => (
                <CertificateSummary key={certificate.name} certificate={certificate} />
              ))
            )}
          </div>
        )}

        <FormGroup error={errors.name}>
          <Label>{t("modals.name")}</Label>
          <Input
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              clearError("name");
            }}
            placeholder={t("modals.namePlaceholder")}
          />
        </FormGroup>
        <FormGroup error={errors.host}>
          <Label>{t("modals.host")}</Label>
          <Input
            value={editHost}
            onChange={(e) => {
              setEditHost(e.target.value);
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
            onTagClick={
              !isContainer && !editCheckPort.trim()
                ? (v) => {
                    setEditCheckPort(v);
                    clearError("checkPort");
                  }
                : undefined
            }
            tagClickTitle={t("modals.useAsCheckPort")}
          />
        </FormGroup>
        {!isContainer && (
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
        )}

        {isContainer && (config?.resourceMonitorEnabled ?? true) && (
          <div className="bg-background rounded-md p-4 mb-3.5 mt-6">
            <ContainerResourceMonitor serviceId={service.id!} />
          </div>
        )}

        {metadataEntries.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setMetadataExpanded((v) => !v)}
              className="flex items-center gap-1.5 w-full bg-transparent border-none py-2 text-muted-foreground text-xs uppercase tracking-wide hover:text-secondary-foreground"
            >
              <span>{metadataExpanded ? "▾" : "▸"}</span>
              {t("drawer.metadata")}
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

      <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-border">
        <div className="flex gap-2">
          <Button variant="destructive" onClick={onDelete}>
            {t("modals.delete")}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("modals.cancel")}
          </Button>
          <Button variant="default" onClick={handleSave}>
            {t("modals.save")}
          </Button>
        </div>
      </div>
    </>
  );
}
