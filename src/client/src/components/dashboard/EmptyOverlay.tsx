import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { colors } from "../../styles/vars";
import { IconServer, IconScan } from "../../utils/Icons";
import { PrimaryButton } from "../../utils/ui";

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

export function EmptyOverlay() {
  const navigate = useNavigate();

  return (
    <Overlay>
      <IconServer size={48} style={{ opacity: 0.3 }} />
      <span>No services yet. Go to Discovery to find services.</span>
      <PrimaryButton onClick={() => navigate("/discover")}>
        <IconScan size={13} />
        Go to Discovery
      </PrimaryButton>
    </Overlay>
  );
}
