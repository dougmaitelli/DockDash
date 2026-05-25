import { useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import type { Service } from "@shared";
import { ServiceProtocol, ServiceSource } from "@shared";
import { SERVICE_PROTOCOLS } from "../../types";
import { colors } from "../../styles/vars";
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StyledInput,
  StyledSelect,
} from "../../utils/ui";
import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";

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

const Row = styled.div`
  display: flex;
  gap: 12px;

  > * {
    flex: 1;
  }
`;

interface EditServiceModalProps {
  service?: Service;
  onSave: (data: Pick<Service, "name" | "host" | "port" | "protocol">) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function EditServiceModal({ service, onSave, onDelete, onCancel }: EditServiceModalProps) {
  const { t } = useTranslation();
  const [editNodeName, setEditNodeName] = useState(service?.name ?? "");
  const [editNodeHost, setEditNodeHost] = useState(service?.host ?? "");
  const [editNodePort, setEditNodePort] = useState(service?.port?.toString() ?? "");
  const [editNodeProtocol, setEditNodeProtocol] = useState<ServiceProtocol>(
    service?.protocol ?? ServiceProtocol.HTTP,
  );

  const handleConfirm = () => {
    const portVal = editNodePort.trim() === "" ? null : parseInt(editNodePort, 10);

    if (isNaN(portVal as number)) {
      return;
    }

    onSave({ name: editNodeName, host: editNodeHost, port: portVal, protocol: editNodeProtocol });
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
            <span style={{ fontSize: "1.2rem" }}>
              {service.source === ServiceSource.DOCKER ? "🐳" : "🌐"}
            </span>
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
      <Row>
        <FormGroup>
          <Label>{t("modals.port")}</Label>
          <StyledInput
            type="number"
            value={editNodePort}
            onChange={(e) => setEditNodePort(e.target.value)}
            placeholder={t("modals.portPlaceholder")}
            min="0"
            max="65535"
          />
        </FormGroup>
        <FormGroup>
          <Label>{t("modals.protocol")}</Label>
          <StyledSelect
            value={editNodeProtocol}
            onChange={(e) => setEditNodeProtocol(e.target.value as ServiceProtocol)}
          >
            {SERVICE_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </StyledSelect>
        </FormGroup>
      </Row>
    </BaseModal>
  );
}
