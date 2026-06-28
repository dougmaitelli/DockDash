import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ServiceLink } from "@shared";
import { ServiceLinkType, ServiceProtocol } from "@shared";
import type { UpdateLinkRequest } from "@shared/api";

import { Icons } from "@/components/Icons";
import { NumberInput } from "@/components/NumberInput";
import { Select } from "@/components/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormValidation } from "@/hooks/useFormValidation";

import { LINK_TYPES } from "../../types";
import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";
import { ConfirmDialog } from "./ConfirmDialog";

function getLinkColor(type: string): string {
  const linkType = LINK_TYPES.find((lt) => lt.value === type);

  return linkType?.color || "var(--accent-gray)";
}

interface EditLinkModalProps {
  link: ServiceLink;
  onSave: (data: UpdateLinkRequest) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function EditLinkModal({ link, onSave, onDelete, onCancel }: EditLinkModalProps) {
  const { t } = useTranslation();
  const [editLabel, setEditLabel] = useState(link.label || "");
  const [editType, setEditType] = useState(link.type || ServiceLinkType.COMMUNICATION);
  const [editDesc, setEditDesc] = useState(link.description || "");
  const [editTargetPort, setEditTargetPort] = useState<string>(
    link.targetPort != null ? String(link.targetPort) : "",
  );
  const { errors, validate, clearError } = useFormValidation({
    targetPort: {
      custom: (v) => {
        const n = Number(v.trim());

        return v.trim() && (isNaN(n) || n < 1 || n > 65535) ? t("modals.portsInvalidPort") : null;
      },
    },
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editProtocol, setEditProtocol] = useState<ServiceProtocol | "">(
    (link.protocol as ServiceProtocol) ?? "",
  );

  const handleConfirm = () => {
    if (!validate({ targetPort: editTargetPort })) return;

    const targetPort = editTargetPort.trim() !== "" ? Number(editTargetPort) : null;
    const protocol = editProtocol !== "" ? editProtocol : null;

    onSave({ label: editLabel, type: editType, description: editDesc, targetPort, protocol });
  };

  return (
    <>
      {confirmingDelete && (
        <ConfirmDialog
          message={t("modals.confirmDeleteLink")}
          onConfirm={onDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      <BaseModal
        title={t("modals.editLinkTitle")}
        onClose={onCancel}
        width={380}
        actions={
          <ModalActions>
            <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
              {t("modals.delete")}
            </Button>
            <ModalActionsRight>
              <Button variant="outline" onClick={onCancel}>
                {t("modals.cancel")}
              </Button>
              <Button variant="default" onClick={handleConfirm}>
                {t("modals.save")}
              </Button>
            </ModalActionsRight>
          </ModalActions>
        }
      >
        <div className="text-sm text-secondary-foreground mb-4 py-2.5 px-3 bg-background rounded-md">
          <div className="flex items-center gap-2">
            <span>{link.sourceName || link.sourceId}</span>
            <Icons.ArrowRight
              size={14}
              style={{ color: getLinkColor(link.type) }}
              className="shrink-0"
            />
            <span>{link.targetName || link.targetId}</span>
          </div>
          {link.label && <div className="mt-1 text-xs text-muted-foreground">{link.label}</div>}
          {link.description && (
            <div className="mt-1 text-xs text-muted-foreground">{link.description}</div>
          )}
        </div>
        <FormGroup>
          <Label>{t("modals.linkType")}</Label>
          <Select
            value={editType}
            onValueChange={(v) => setEditType(v as ServiceLinkType)}
            options={LINK_TYPES.map((lt) => ({
              value: lt.value,
              label: t(`dashboard.linkTypes.${lt.value}`),
            }))}
          />
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkLabel")}</Label>
          <Input
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            placeholder={t("modals.linkLabelPlaceholder")}
          />
        </FormGroup>
        <FormGroup error={errors.targetPort}>
          <Label>{t("modals.linkTargetPort")}</Label>
          <NumberInput
            min={1}
            max={65535}
            value={editTargetPort}
            onChange={(e) => {
              setEditTargetPort(e.target.value);
              clearError("targetPort");
            }}
            placeholder={t("modals.linkTargetPortPlaceholder")}
          />
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkProtocol")}</Label>
          <Select
            value={editProtocol || "__none__"}
            onValueChange={(v) => setEditProtocol(v === "__none__" ? "" : (v as ServiceProtocol))}
            options={[
              { value: "__none__", label: t("modals.linkProtocolNone") },
              ...Object.values(ServiceProtocol).map((p) => ({ value: p, label: p })),
            ]}
          />
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkDescription")}</Label>
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t("modals.linkDescriptionPlaceholder")}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-vertical min-h-[60px]"
          />
        </FormGroup>
      </BaseModal>
    </>
  );
}
