import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { colors } from "../../styles/theme";
import { IconServer, IconScan } from "../../utils/Icons";

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: ${colors.textMuted};
  font-size: 0.9rem;
  background: rgba(13, 11, 20, 0.5);
  backdrop-filter: blur(2px);
`;

const GoButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  background: ${colors.accentBlue};
  color: white;

  &:hover {
    background: ${colors.accentBlueDark};
  }
`;

export function EmptyOverlay() {
  const navigate = useNavigate();

  return (
    <Overlay>
      <IconServer size={48} style={{ opacity: 0.3 }} />
      <span>No services yet. Go to Discovery to find services.</span>
      <GoButton onClick={() => navigate("/discover")}>
        <IconScan size={13} />
        Go to Discovery
      </GoButton>
    </Overlay>
  );
}
