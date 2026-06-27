import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Service } from "@shared";

import { NumberInput } from "@/components/NumberInput";
import { NumberTagArrayInput } from "@/components/TagArrayInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormValidation } from "@/hooks/useFormValidation";

import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";

interface AddServiceModalProps {
  onSave: (data: Pick<Service, "name" | "host" | "ports" | "checkPort">) => void;
  onCancel: () => void;
}

export function AddServiceModal({ onSave, onCancel }: AddServiceModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [ports, setPorts] = useState<number[]>([]);
  const [checkPort, setCheckPort] = useState("");
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

  const handlePortsChange = (vals: string[]) => {
    setPorts(vals.map(Number).sort((a, b) => a - b));
  };

  const validatePort = (value: string, existing: string[]) => {
    const n = parseInt(value, 10);

    if (isNaN(n) || n < 1 || n > 65535) return t("modals.portsInvalidPort");

    if (existing.includes(value)) return t("modals.portsDuplicate");

    return null;
  };

  const handleConfirm = () => {
    if (!validate({ name, host, checkPort })) return;

    const cp = parseInt(checkPort, 10);

    onSave({
      name,
      host,
      ports,
      checkPort: isNaN(cp) ? null : cp,
    });
  };

  return (
    <BaseModal
      title={t("modals.addServiceTitle")}
      onClose={onCancel}
      width={400}
      actions={
        <ModalActions>
          <ModalActionsRight>
            <Button variant="outline" onClick={onCancel}>
              {t("modals.cancel")}
            </Button>
            <Button variant="default" onClick={handleConfirm}>
              {t("modals.add")}
            </Button>
          </ModalActionsRight>
        </ModalActions>
      }
    >
      <FormGroup error={errors.name}>
        <Label>{t("modals.name")}</Label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearError("name");
          }}
          placeholder={t("modals.namePlaceholder")}
        />
      </FormGroup>
      <FormGroup error={errors.host}>
        <Label>{t("modals.host")}</Label>
        <Input
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            clearError("host");
          }}
          placeholder={t("modals.hostPlaceholder")}
        />
      </FormGroup>
      <FormGroup>
        <Label>{t("modals.ports")}</Label>
        <NumberTagArrayInput
          values={ports.map(String)}
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
          value={checkPort}
          onChange={(e) => {
            setCheckPort(e.target.value);
            clearError("checkPort");
          }}
          placeholder={t("modals.checkPortPlaceholder")}
        />
      </FormGroup>
    </BaseModal>
  );
}
