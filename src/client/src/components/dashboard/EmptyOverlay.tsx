import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { colors } from "../../styles/vars";
import { Icons } from "../../utils/Icons";
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
  const { t } = useTranslation();

  return (
    <Overlay>
      <Icons.Server size={48} style={{ opacity: 0.3 }} />
      <span>{t("dashboard.emptyMessage")}</span>
      <PrimaryButton onClick={() => navigate("/discover")}>
        <Icons.Scan size={14} />
        {t("dashboard.goToDiscovery")}
      </PrimaryButton>
    </Overlay>
  );
}
