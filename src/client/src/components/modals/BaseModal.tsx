import type { ReactNode } from "react";
import styled from "styled-components";

const ModalOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 199;
  background: rgba(0, 0, 0, 0.5);
`;

const ModalPanel = styled.div<{ $width: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1e2230;
  border: 1px solid #2d3348;
  border-radius: 12px;
  padding: 24px;
  z-index: 200;
  width: ${({ $width }) => $width}px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
`;

export const ModalTitle = styled.h3`
  font-size: 1rem;
  margin-bottom: 16px;
  color: #e8eaf0;
`;

export const FormGroup = styled.div`
  margin-bottom: 14px;
`;

export const Label = styled.label`
  display: block;
  font-size: 0.75rem;
  color: #6b7290;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const ModalActions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 20px;
`;

export const ModalActionsRight = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

interface BaseModalProps {
  onClose: () => void;
  title: string;
  actions: ReactNode;
  children: ReactNode;
  width?: number;
}

export function BaseModal({ onClose, title, actions, children, width = 400 }: BaseModalProps) {
  return (
    <>
      <ModalOverlay onClick={onClose} />
      <ModalPanel $width={width} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>{title}</ModalTitle>
        {children}
        {actions}
      </ModalPanel>
    </>
  );
}
