import styled from "styled-components";

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
  background: #1a1d27;
  border: 1px solid #2d3348;
  border-radius: 10px;
  overflow: hidden;
  min-height: 400px;
`;

export const Canvas = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-image: radial-gradient(#2d3348 1px, transparent 1px);
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
  background: rgba(30, 34, 48, 0.9);
  border-bottom: 1px solid #2d3348;
`;

export const ToolButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== "active",
})<{ active?: boolean }>`
  padding: 8px 14px;
  border: 1px solid ${(props) => (props.active ? "#3b82f6" : "#2d3348")};
  background: ${(props) => (props.active ? "rgba(59, 130, 246, 0.15)" : "transparent")};
  color: ${(props) => (props.active ? "#3b82f6" : "#9ca3b8")};
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #2d3348;
`;

export const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  color: #e8eaf0;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7290;
  gap: 12px;
  font-size: 0.9rem;

  svg {
    opacity: 0.3;
  }
`;
