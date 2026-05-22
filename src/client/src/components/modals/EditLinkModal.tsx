import { useState } from "react";
import styled from "styled-components";
import type { ServiceLink } from "@shared";
import { LINK_TYPES, ServiceLinkType } from "../../types";
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StyledInput,
  StyledSelect,
} from "../../utils/ui";
import { BaseModal, FormGroup, Label, ModalActions, ModalActionsRight } from "./BaseModal";

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #2d3348;
  border-radius: 6px;
  background: #0f1117;
  color: #e8eaf0;
  font-size: 0.85rem;
  outline: none;
  resize: vertical;
  min-height: 60px;

  &:focus {
    border-color: #3b82f6;
  }
`;

function getLinkColor(type: string): string {
  const linkType = LINK_TYPES.find((lt) => lt.value === type);

  return linkType?.color || "#6b7280";
}

interface EditLinkModalProps {
  link: ServiceLink;
  onSave: (data: Pick<ServiceLink, "label" | "type" | "description">) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function EditLinkModal({ link, onSave, onDelete, onCancel }: EditLinkModalProps) {
  const [editLabel, setEditLabel] = useState(link.label || "");
  const [editType, setEditType] = useState(link.type || ServiceLinkType.COMMUNICATION);
  const [editDesc, setEditDesc] = useState(link.description || "");

  const handleConfirm = () => {
    onSave({ label: editLabel, type: editType, description: editDesc });
  };

  return (
    <BaseModal
      title="Edit Link"
      onClose={onCancel}
      width={380}
      actions={
        <ModalActions>
          <DangerButton onClick={onDelete}>Delete</DangerButton>
          <ModalActionsRight>
            <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleConfirm}>Save</PrimaryButton>
          </ModalActionsRight>
        </ModalActions>
      }
    >
      <div
        style={{
          fontSize: "0.85rem",
          color: "#9ca3b8",
          marginBottom: 16,
          padding: "10px 12px",
          background: "#0f1117",
          borderRadius: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{link.source_name || link.source_id}</span>
          <span style={{ color: getLinkColor(link.type) }}>→</span>
          <span>{link.target_name || link.target_id}</span>
        </div>
        {link.label && (
          <div style={{ marginTop: 4, fontSize: "0.8rem", color: "#6b7290" }}>{link.label}</div>
        )}
        {link.description && (
          <div style={{ marginTop: 4, fontSize: "0.8rem", color: "#6b7290" }}>
            {link.description}
          </div>
        )}
      </div>
      <FormGroup>
        <Label>Link Type</Label>
        <StyledSelect
          value={editType}
          onChange={(e) => setEditType(e.target.value as ServiceLinkType)}
        >
          {LINK_TYPES.map((lt) => (
            <option key={lt.value} value={lt.value}>
              {lt.label}
            </option>
          ))}
        </StyledSelect>
      </FormGroup>
      <FormGroup>
        <Label>Label (optional)</Label>
        <StyledInput
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          placeholder="e.g., REST API, gRPC, WebSocket"
        />
      </FormGroup>
      <FormGroup>
        <Label>Description (optional)</Label>
        <TextArea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Describe the relationship..."
        />
      </FormGroup>
    </BaseModal>
  );
}
