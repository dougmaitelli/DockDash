import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { colors } from "../../styles/vars";
import { DangerButton, SecondaryButton, ModalBackdrop } from "../../utils/ui";

const Overlay = styled(ModalBackdrop)`
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Panel = styled.div`
  background: ${colors.bgCard};
  border: 1px solid ${colors.border};
  border-radius: 10px;
  padding: 24px;
  width: 340px;
  box-shadow: 0 20px 60px ${colors.blackAlpha50};
`;

const Message = styled.p`
  font-size: 0.9rem;
  color: ${colors.textSecondary};
  margin-bottom: 20px;
  line-height: 1.5;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Overlay onClick={onCancel}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <Message>{message}</Message>
        <Actions>
          <SecondaryButton onClick={onCancel}>{t("modals.cancel")}</SecondaryButton>
          <DangerButton onClick={onConfirm}>{confirmLabel ?? t("modals.delete")}</DangerButton>
        </Actions>
      </Panel>
    </Overlay>
  );
}
