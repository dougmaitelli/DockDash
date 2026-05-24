import styled from "styled-components";
import { colors } from "../../styles/theme";

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

const RetryButton = styled.button`
  margin-top: 4px;
  padding: 7px 20px;
  border: 1px solid ${colors.accentRed};
  background: transparent;
  color: ${colors.accentRed};
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${colors.accentRedAlpha15};
  }
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
        <RetryButton onClick={onRetry}>Retry</RetryButton>
      </Box>
    </Overlay>
  );
}
