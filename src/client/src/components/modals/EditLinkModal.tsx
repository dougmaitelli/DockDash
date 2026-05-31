import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import type { ServiceLink } from "@shared";
import { ServiceProtocol } from "@shared";
import { LINK_TYPES, ServiceLinkType, SERVICE_PROTOCOLS } from "../../types";
import { colors } from "../../styles/vars";
import { rawColors } from "../../styles/themes/dark.theme";
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StyledInput,
  NumberInput,
  StyledSelect,
} from "../../utils/ui";
import { IconArrowRight } from "../../utils/Icons";
import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${colors.border};
  border-radius: 6px;
  background: ${colors.bgPrimary};
  color: ${colors.textPrimary};
  font-size: 0.85rem;
  outline: none;
  resize: vertical;
  min-height: 60px;

  &:focus {
    border-color: ${colors.accentBlue};
  }
`;

function getLinkColor(type: string): string {
  const linkType = LINK_TYPES.find((lt) => lt.value === type);

  return linkType?.color || rawColors.accentGray;
}

interface EditLinkModalProps {
  link: ServiceLink;
  onSave: (
    data: Pick<ServiceLink, "label" | "type" | "description" | "targetPort" | "protocol">,
  ) => void;
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editProtocol, setEditProtocol] = useState<ServiceProtocol | "">(
    (link.protocol as ServiceProtocol) ?? "",
  );

  const handleConfirm = () => {
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
            <DangerButton onClick={() => setConfirmingDelete(true)}>
              {t("modals.delete")}
            </DangerButton>
            <ModalActionsRight>
              <SecondaryButton onClick={onCancel}>{t("modals.cancel")}</SecondaryButton>
              <PrimaryButton onClick={handleConfirm}>{t("modals.save")}</PrimaryButton>
            </ModalActionsRight>
          </ModalActions>
        }
      >
        <div
          style={{
            fontSize: "0.85rem",
            color: colors.textSecondary,
            marginBottom: 16,
            padding: "10px 12px",
            background: colors.bgPrimary,
            borderRadius: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{link.source_name || link.source_id}</span>
            <IconArrowRight size={14} style={{ color: getLinkColor(link.type), flexShrink: 0 }} />
            <span>{link.target_name || link.target_id}</span>
          </div>
          {link.label && (
            <div style={{ marginTop: 4, fontSize: "0.8rem", color: colors.textMuted }}>
              {link.label}
            </div>
          )}
          {link.description && (
            <div style={{ marginTop: 4, fontSize: "0.8rem", color: colors.textMuted }}>
              {link.description}
            </div>
          )}
        </div>
        <FormGroup>
          <Label>{t("modals.linkType")}</Label>
          <StyledSelect
            value={editType}
            onChange={(e) => setEditType(e.target.value as ServiceLinkType)}
          >
            {LINK_TYPES.map((lt) => (
              <option key={lt.value} value={lt.value}>
                {t(`dashboard.linkTypes.${lt.value}`)}
              </option>
            ))}
          </StyledSelect>
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkLabel")}</Label>
          <StyledInput
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            placeholder={t("modals.linkLabelPlaceholder")}
          />
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkTargetPort")}</Label>
          <NumberInput
            min={1}
            max={65535}
            value={editTargetPort}
            onChange={(e) => setEditTargetPort(e.target.value)}
            placeholder={t("modals.linkTargetPortPlaceholder")}
          />
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkProtocol")}</Label>
          <StyledSelect
            value={editProtocol}
            onChange={(e) => setEditProtocol(e.target.value as ServiceProtocol | "")}
          >
            <option value="">{t("modals.linkProtocolNone")}</option>
            {SERVICE_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </StyledSelect>
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.linkDescription")}</Label>
          <TextArea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t("modals.linkDescriptionPlaceholder")}
          />
        </FormGroup>
      </BaseModal>
    </>
  );
}
