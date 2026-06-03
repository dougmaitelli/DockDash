import { useState, Fragment } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import type { Service } from "@shared";
import { ServiceSource } from "@shared";
import { colors } from "../../styles/vars";
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StyledInput,
  NumberInput,
} from "../../utils/ui";
import { NumberTagArrayInput } from "../../utils/TagArrayInput";
import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";
import { Icons } from "../../utils/Icons";

const NodeInfo = styled.div`
  font-size: 0.85rem;
  color: ${colors.textSecondary};
  margin-bottom: 16px;
  padding: 10px 12px;
  background: ${colors.bgPrimary};
  border-radius: 6px;
`;

const NodeId = styled.div`
  font-size: 0.7rem;
  color: ${colors.textMuted};
  font-family: "SF Mono", "Fira Code", monospace;
  margin-top: 4px;
`;

const MetadataToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  padding: 8px 0 4px;
  cursor: pointer;
  color: ${colors.textMuted};
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &:hover {
    color: ${colors.textSecondary};
  }
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  padding: 8px 12px;
  background: ${colors.bgPrimary};
  border-radius: 6px;
  margin-bottom: 14px;
`;

const MetaKey = styled.span`
  font-size: 0.75rem;
  font-family: "SF Mono", "Fira Code", monospace;
  color: ${colors.textMuted};
  white-space: nowrap;
`;

const MetaValue = styled.span`
  font-size: 0.75rem;
  color: ${colors.textSecondary};
  word-break: break-all;
`;

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
          {onDelete && <DangerButton onClick={onDelete}>{t("modals.delete")}</DangerButton>}
          <ModalActionsRight>
            <SecondaryButton onClick={onCancel}>{t("modals.cancel")}</SecondaryButton>
            <PrimaryButton onClick={handleConfirm}>
              {service ? t("modals.save") : t("modals.add")}
            </PrimaryButton>
          </ModalActionsRight>
        </ModalActions>
      }
    >
      {service && (
        <NodeInfo>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {service.source === ServiceSource.DOCKER ? (
              <Icons.Docker size={20} style={{ color: colors.textMuted }} />
            ) : (
              <Icons.Globe size={20} style={{ color: colors.textMuted }} />
            )}
            <div>
              <div style={{ fontWeight: 600, color: colors.textPrimary }}>{service.name}</div>
              <NodeId>{service.id}</NodeId>
            </div>
          </div>
        </NodeInfo>
      )}
      <FormGroup>
        <Label>{t("modals.name")}</Label>
        <StyledInput
          value={editNodeName}
          onChange={(e) => setEditNodeName(e.target.value)}
          placeholder={t("modals.namePlaceholder")}
        />
      </FormGroup>
      <FormGroup>
        <Label>{t("modals.host")}</Label>
        <StyledInput
          value={editNodeHost}
          onChange={(e) => setEditNodeHost(e.target.value)}
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
      <FormGroup>
        <Label>{t("modals.checkPort")}</Label>
        <NumberInput
          value={editCheckPort}
          onChange={(e) => setEditCheckPort(e.target.value)}
          placeholder={t("modals.checkPortPlaceholder")}
        />
      </FormGroup>
      {metadataEntries.length > 0 && (
        <>
          <MetadataToggle onClick={() => setMetadataExpanded((v) => !v)}>
            <span>{metadataExpanded ? "▾" : "▸"}</span>
            {t("modals.metadata")}
          </MetadataToggle>
          {metadataExpanded && (
            <MetadataGrid>
              {metadataEntries.map(({ key, value }) => (
                <Fragment key={key}>
                  <MetaKey>{key}</MetaKey>
                  <MetaValue>{value}</MetaValue>
                </Fragment>
              ))}
            </MetadataGrid>
          )}
        </>
      )}
    </BaseModal>
  );
}
