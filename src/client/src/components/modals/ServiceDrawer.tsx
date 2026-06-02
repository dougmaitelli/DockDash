import { useState, Fragment, useCallback } from "react";
import styled, { keyframes } from "styled-components";
import { useTranslation } from "react-i18next";
import type { Service, ContainerAction } from "@shared";
import { ServiceSource } from "@shared";
import { colors } from "../../styles/vars";
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StyledInput,
  NumberInput,
} from "../../utils/ui";
import { NumberTagArrayInput } from "../../utils/TagArrayInput";
import { IconDocker, IconGlobe, IconX } from "../../utils/Icons";
import { FormGroup, Label } from "./BaseModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { HealthHistoryGraph } from "./HealthHistoryGraph";
import { DockerLogs } from "./DockerLogs";
import { Changelog } from "./Changelog";
import { ContainerControls } from "./ContainerControls";

const ANIM_MS = 220;

type Tab = "details" | "logs" | "changelog";

const slideIn = keyframes`
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
`;

const slideOut = keyframes`
  from { transform: translateX(0); }
  to   { transform: translateX(-100%); }
`;

const Drawer = styled.div<{ $closing: boolean; $wide: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  height: 100%;
  width: ${({ $wide }) => ($wide ? "900px" : "600px")};
  background: ${colors.bgSecondary};
  border-right: 1px solid ${colors.border};
  z-index: 101;
  display: flex;
  flex-direction: column;
  animation: ${({ $closing }) => ($closing ? slideOut : slideIn)} ${ANIM_MS}ms ease;
  transition: width ${ANIM_MS}ms ease;
  animation-fill-mode: both;
  box-shadow: 6px 0 32px ${colors.blackAlpha40};
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid ${colors.border};
`;

const HeaderInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const HeaderName = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: ${colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeaderId = styled.div`
  font-size: 0.65rem;
  color: ${colors.textMuted};
  font-family: "SF Mono", "Fira Code", monospace;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${colors.textMuted};
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  flex-shrink: 0;

  &:hover {
    color: ${colors.textPrimary};
  }
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${colors.border};
  padding: 0 20px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? colors.accentBlue : "transparent")};
  padding: 10px 14px 8px;
  margin-bottom: -1px;
  font-size: 0.8rem;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active }) => ($active ? colors.textPrimary : colors.textMuted)};
  cursor: pointer;

  &:hover {
    color: ${colors.textPrimary};
  }
`;

const Body = styled.div<{ $padded?: boolean }>`
  flex: 1;
  overflow-y: auto;
  padding: ${({ $padded }) => ($padded ? "20px" : "16px 20px 0")};
  display: flex;
  flex-direction: column;
`;

const MetadataToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  padding: 8px 0 4px;
  cursor: pointer;
  color: ${colors.textMuted};
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &:hover {
    color: ${colors.textSecondary};
  }
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  padding: 8px 12px;
  background: ${colors.bgPrimary};
  border-radius: 6px;
  margin-bottom: 14px;
`;

const MetaKey = styled.span`
  font-size: 0.75rem;
  font-family: "SF Mono", "Fira Code", monospace;
  color: ${colors.textMuted};
  white-space: nowrap;
`;

const MetaValue = styled.span`
  font-size: 0.75rem;
  color: ${colors.textSecondary};
  word-break: break-all;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid ${colors.border};
`;

const FooterRight = styled.div`
  display: flex;
  gap: 8px;
`;

const HeaderActions = styled.div`
  display: flex;
  flex-shrink: 0;
`;

interface ServiceDrawerProps {
  service: Service;
  onSave: (data: Pick<Service, "name" | "host" | "ports" | "checkPort">) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ServiceDrawer({ service, onSave, onDelete, onClose }: ServiceDrawerProps) {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [editName, setEditName] = useState(service.name);
  const [editHost, setEditHost] = useState(service.host);
  const [editPorts, setEditPorts] = useState<number[]>(service.ports ?? []);
  const [editCheckPort, setEditCheckPort] = useState(service.checkPort?.toString() ?? "");
  const [metadataExpanded, setMetadataExpanded] = useState(false);

  const isDocker = service.source === ServiceSource.DOCKER;
  const [logsReconnectTrigger, setLogsReconnectTrigger] = useState(0);

  const handleContainerActionComplete = useCallback((action: ContainerAction) => {
    if (action === "start" || action === "restart") {
      setTimeout(() => setLogsReconnectTrigger((n) => n + 1), 500);
    }
  }, []);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, ANIM_MS);
  };

  const metadataEntries = service.metadata
    ? Object.entries(service.metadata).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value.join(", ") : String(value),
      }))
    : [];

  const handlePortsChange = (vals: string[]) => {
    setEditPorts(vals.map(Number).sort((a, b) => a - b));
  };

  const validatePort = (value: string, existing: string[]) => {
    const n = parseInt(value, 10);

    if (isNaN(n) || n < 1 || n > 65535) return t("modals.portsInvalidPort");

    if (existing.includes(value)) return t("modals.portsDuplicate");

    return null;
  };

  const handleSave = () => {
    const checkPort = parseInt(editCheckPort, 10);

    onSave({
      name: editName,
      host: editHost,
      ports: editPorts,
      checkPort: isNaN(checkPort) ? null : checkPort,
    });
  };

  return (
    <>
      {confirmingDelete && (
        <ConfirmDialog
          message={t("modals.confirmDeleteService")}
          onConfirm={() => {
            setConfirmingDelete(false);
            dismiss();
            setTimeout(onDelete, ANIM_MS);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      <Drawer $closing={closing} $wide={tab !== "details"}>
        <Header>
          {isDocker ? (
            <IconDocker
              size={18}
              style={{ color: colors.textMuted, flexShrink: 0, marginTop: 2 }}
            />
          ) : (
            <IconGlobe size={18} style={{ color: colors.textMuted, flexShrink: 0, marginTop: 2 }} />
          )}
          <HeaderInfo>
            <HeaderName>{service.name}</HeaderName>
            <HeaderId>{service.id}</HeaderId>
          </HeaderInfo>
          {isDocker && (
            <HeaderActions>
              <ContainerControls
                service={service}
                onActionComplete={handleContainerActionComplete}
              />
            </HeaderActions>
          )}
          <CloseButton onClick={dismiss}>
            <IconX size={16} />
          </CloseButton>
        </Header>

        <TabBar>
          <TabButton $active={tab === "details"} onClick={() => setTab("details")}>
            {t("modals.tabDetails")}
          </TabButton>
          {isDocker && (
            <TabButton $active={tab === "changelog"} onClick={() => setTab("changelog")}>
              {t("modals.tabChangelog")}
            </TabButton>
          )}
          {isDocker && (
            <TabButton $active={tab === "logs"} onClick={() => setTab("logs")}>
              {t("modals.tabLogs")}
            </TabButton>
          )}
        </TabBar>

        {tab === "details" ? (
          <Body $padded>
            <HealthHistoryGraph serviceId={service.id!} />

            <FormGroup>
              <Label>{t("modals.name")}</Label>
              <StyledInput
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("modals.namePlaceholder")}
              />
            </FormGroup>
            <FormGroup>
              <Label>{t("modals.host")}</Label>
              <StyledInput
                value={editHost}
                onChange={(e) => setEditHost(e.target.value)}
                placeholder={t("modals.hostPlaceholder")}
              />
            </FormGroup>
            <FormGroup>
              <Label>{t("modals.ports")}</Label>
              <NumberTagArrayInput
                values={editPorts.map(String)}
                onChange={handlePortsChange}
                validate={validatePort}
                min={1}
                max={65535}
                formatTag={(v) => `:${v}`}
                placeholder={t("modals.portsPlaceholder")}
              />
            </FormGroup>
            <FormGroup>
              <Label>{t("modals.checkPort")}</Label>
              <NumberInput
                value={editCheckPort}
                onChange={(e) => setEditCheckPort(e.target.value)}
                placeholder={t("modals.checkPortPlaceholder")}
              />
            </FormGroup>

            {metadataEntries.length > 0 && (
              <>
                <MetadataToggle onClick={() => setMetadataExpanded((v) => !v)}>
                  <span>{metadataExpanded ? "▾" : "▸"}</span>
                  {t("modals.metadata")}
                </MetadataToggle>
                {metadataExpanded && (
                  <MetadataGrid>
                    {metadataEntries.map(({ key, value }) => (
                      <Fragment key={key}>
                        <MetaKey>{key}</MetaKey>
                        <MetaValue>{value}</MetaValue>
                      </Fragment>
                    ))}
                  </MetadataGrid>
                )}
              </>
            )}
          </Body>
        ) : tab === "logs" ? (
          <Body>
            <DockerLogs serviceId={service.id!} reconnectTrigger={logsReconnectTrigger} />
          </Body>
        ) : (
          <Body>
            <Changelog serviceId={service.id!} />
          </Body>
        )}

        {tab === "details" && (
          <Footer>
            <DangerButton onClick={() => setConfirmingDelete(true)}>
              {t("modals.delete")}
            </DangerButton>
            <FooterRight>
              <SecondaryButton onClick={dismiss}>{t("modals.cancel")}</SecondaryButton>
              <PrimaryButton onClick={handleSave}>{t("modals.save")}</PrimaryButton>
            </FooterRight>
          </Footer>
        )}
      </Drawer>
    </>
  );
}
