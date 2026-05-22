import { useState } from "react";
import styled from "styled-components";
import type { Service } from "@shared";
import { ServiceSource } from "@shared";
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
  color: #9ca3b8;
  margin-bottom: 16px;
  padding: 10px 12px;
  background: #0f1117;
  border-radius: 6px;
`;

const NodeId = styled.div`
  font-size: 0.7rem;
  color: #6b7290;
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
  const [editNodeName, setEditNodeName] = useState(service?.name ?? "");
  const [editNodeHost, setEditNodeHost] = useState(service?.host ?? "");
  const [editNodePort, setEditNodePort] = useState(service?.port?.toString() ?? "");
  const [editNodeProtocol, setEditNodeProtocol] = useState(service?.protocol ?? "http");

  const handleConfirm = () => {
    const portVal = editNodePort.trim() === "" ? null : parseInt(editNodePort, 10);

    if (isNaN(portVal as number)) {
      return;
    }

    onSave({ name: editNodeName, host: editNodeHost, port: portVal, protocol: editNodeProtocol });
  };

  return (
    <BaseModal
      title={service ? "Edit Service" : "Add Service"}
      onClose={onCancel}
      width={400}
      actions={
        <ModalActions>
          {onDelete && <DangerButton onClick={onDelete}>Delete</DangerButton>}
          <ModalActionsRight>
            <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleConfirm}>{service ? "Save" : "Add"}</PrimaryButton>
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
              <div style={{ fontWeight: 600, color: "#e8eaf0" }}>{service.name}</div>
              <NodeId>{service.id}</NodeId>
            </div>
          </div>
        </NodeInfo>
      )}
      <FormGroup>
        <Label>Name</Label>
        <StyledInput
          value={editNodeName}
          onChange={(e) => setEditNodeName(e.target.value)}
          placeholder="Service name"
        />
      </FormGroup>
      <FormGroup>
        <Label>Host</Label>
        <StyledInput
          value={editNodeHost}
          onChange={(e) => setEditNodeHost(e.target.value)}
          placeholder="IP address or hostname"
        />
      </FormGroup>
      <Row>
        <FormGroup>
          <Label>Port</Label>
          <StyledInput
            type="number"
            value={editNodePort}
            onChange={(e) => setEditNodePort(e.target.value)}
            placeholder="Optional"
            min="0"
            max="65535"
          />
        </FormGroup>
        <FormGroup>
          <Label>Protocol</Label>
          <StyledSelect
            value={editNodeProtocol}
            onChange={(e) => setEditNodeProtocol(e.target.value)}
          >
            <option value="http">http</option>
            <option value="https">https</option>
            <option value="tcp">tcp</option>
            <option value="udp">udp</option>
            <option value="postgresql">postgresql</option>
            <option value="mysql">mysql</option>
            <option value="redis">redis</option>
            <option value="grpc">grpc</option>
            <option value="websocket">websocket</option>
            <option value="custom">custom</option>
          </StyledSelect>
        </FormGroup>
      </Row>
    </BaseModal>
  );
}
