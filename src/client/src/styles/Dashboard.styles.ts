import styled from "styled-components";
import { colors } from "../styles/theme";

export const Page = styled.div`
  padding: 24px;
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const CanvasWrapper = styled.div`
  flex: 1;
  position: relative;
  background: ${colors.bgSecondary};
  border: 1px solid ${colors.border};
  border-radius: 10px;
  overflow: hidden;
  min-height: 400px;
`;

export const Canvas = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-image: radial-gradient(${colors.border} 1px, transparent 1px);
  background-size: 24px 24px;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${colors.bgCardAlpha90};
  border-bottom: 1px solid ${colors.border};
`;

export const ToolButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== "active",
})<{ active?: boolean }>`
  padding: 8px 14px;
  border: 1px solid ${(props) => (props.active ? colors.accentBlue : colors.border)};
  background: ${(props) => (props.active ? colors.accentBlueAlpha15 : "transparent")};
  color: ${(props) => (props.active ? colors.accentBlue : colors.textSecondary)};
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${colors.accentBlue};
    color: ${colors.accentBlue};
  }
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid ${colors.border};
`;

export const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  color: ${colors.textPrimary};
`;

export const EmptyState = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${colors.textMuted};
  gap: 12px;
  font-size: 0.9rem;

  > svg {
    opacity: 0.3;
  }
`;
