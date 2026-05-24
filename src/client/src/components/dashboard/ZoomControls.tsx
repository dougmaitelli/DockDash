import styled from "styled-components";
import { colors } from "../../styles/theme";
import { IconPlus, IconMinus, IconResetView } from "../../utils/Icons";

const Wrapper = styled.div`
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 10;
  pointer-events: all;
`;

const ZoomButton = styled.button`
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.bgSecondary};
  border: 1px solid ${colors.border};
  border-radius: 6px;
  color: ${colors.textSecondary};
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${colors.accentBlue};
    color: ${colors.accentBlue};
  }
`;

const ResetButton = styled(ZoomButton)`
  margin-top: 4px;
  font-size: 1rem;
`;

const ZoomLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 600;
  color: ${colors.textLight};
  min-width: 32px;
  text-align: center;
  letter-spacing: 0.3px;
`;

interface ZoomControlsProps {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function ZoomControls({
  zoom,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomControlsProps) {
  return (
    <Wrapper>
      <ZoomButton onClick={onZoomIn} disabled={zoom >= maxZoom} title="Zoom in">
        <IconPlus size={16} />
      </ZoomButton>
      <ZoomLabel>{Math.round(zoom * 100)}%</ZoomLabel>
      <ZoomButton onClick={onZoomOut} disabled={zoom <= minZoom} title="Zoom out">
        <IconMinus size={16} />
      </ZoomButton>
      <ResetButton onClick={onReset} title="Reset view">
        <IconResetView size={16} />
      </ResetButton>
    </Wrapper>
  );
}
