import styled from "styled-components";
import { colors } from "../../styles/vars";
import { DangerButton } from "../../utils/ui";

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(13, 11, 20, 0.5);
  backdrop-filter: blur(2px);
`;

const Box = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 36px;
  background: ${colors.bgCard};
  border: 1px solid ${colors.accentRed};
  border-radius: 12px;
  text-align: center;
  max-width: 420px;
`;

const Title = styled.p`
  font-size: 0.95rem;
  font-weight: 600;
  color: ${colors.textPrimary};
  margin: 0;
`;

const Message = styled.p`
  font-size: 0.8rem;
  color: ${colors.textMuted};
  margin: 0;
  word-break: break-word;
`;

interface ErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

export function ErrorOverlay({ message, onRetry }: ErrorOverlayProps) {
  return (
    <Overlay>
      <Box>
        <Title>Failed to load dashboard</Title>
        <Message>{message}</Message>
        <DangerButton onClick={onRetry}>Retry</DangerButton>
      </Box>
    </Overlay>
  );
}
