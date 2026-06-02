import { useState, useCallback } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import type { Service, ContainerAction } from "@shared";
import { ServiceStatus } from "@shared";
import { colors } from "../../styles/vars";
import { IconStop, IconPlay, IconRefresh } from "../../utils/Icons";
import { serviceApi } from "../../services/api";

const ButtonRow = styled.div`
  display: flex;
  gap: 5px;
`;

const ContainerBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: filter 0.15s;

  &:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    filter: brightness(0.88);
  }
`;

const StopBtn = styled(ContainerBtn)`
  background: ${colors.accentRed};
  color: white;
`;

const StartBtn = styled(ContainerBtn)`
  background: ${colors.accentGreen};
  color: white;
`;

const RestartBtn = styled(ContainerBtn)`
  background: ${colors.accentYellow};
  color: rgba(0, 0, 0, 0.8);
`;

const ErrorText = styled.span`
  font-size: 0.7rem;
  color: ${colors.accentRed};
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`;

interface ContainerControlsProps {
  service: Service;
  onActionComplete?: (action: ContainerAction) => void;
}

export function ContainerControls({ service, onActionComplete }: ContainerControlsProps) {
  const { t } = useTranslation();
  const [activeAction, setActiveAction] = useState<ContainerAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = useCallback(
    async (action: ContainerAction) => {
      setActiveAction(action);
      setError(null);

      try {
        await serviceApi.containerAction(service.id!, action);
        onActionComplete?.(action);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setActiveAction(null);
      }
    },
    [service.id, onActionComplete],
  );

  return (
    <Wrap>
      <ButtonRow>
        <StopBtn
          onClick={() => handleAction("stop")}
          disabled={activeAction !== null || service.status !== ServiceStatus.UP}
          title={t("modals.containerStop")}
        >
          <IconStop size={13} />
        </StopBtn>
        <StartBtn
          onClick={() => handleAction("start")}
          disabled={activeAction !== null || service.status !== ServiceStatus.DOWN}
          title={t("modals.containerStart")}
        >
          <IconPlay size={13} />
        </StartBtn>
        <RestartBtn
          onClick={() => handleAction("restart")}
          disabled={activeAction !== null || service.status !== ServiceStatus.UP}
          title={t("modals.containerRestart")}
        >
          <IconRefresh size={13} />
        </RestartBtn>
      </ButtonRow>
      {error && <ErrorText title={error}>{t("modals.containerActionFailed", { error })}</ErrorText>}
    </Wrap>
  );
}
