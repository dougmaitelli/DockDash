import { type ComponentPropsWithoutRef } from "react";
import styled from "styled-components";
import { colors } from "../styles/vars";

export const ActionButton = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const PrimaryButton = styled(ActionButton)`
  background: ${colors.accentBlue};
  color: white;

  &:hover:not(:disabled) {
    background: ${colors.accentBlueDark};
  }
`;

export const SecondaryButton = styled(ActionButton)`
  background: transparent;
  border: 1px solid ${colors.border};
  color: ${colors.textSecondary};

  &:hover:not(:disabled) {
    border-color: ${colors.accentBlue};
    color: ${colors.accentBlue};
  }
`;

export const DangerButton = styled(ActionButton)`
  background: ${colors.accentRed};
  color: white;

  &:hover:not(:disabled) {
    background: ${colors.accentRedDark};
  }
`;

export const StyledInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${colors.border};
  border-radius: 6px;
  background: ${colors.bgPrimary};
  color: ${colors.textPrimary};
  font-size: 0.85rem;
  outline: none;

  &:focus {
    border-color: ${colors.accentBlue};
  }

  &[type="number"]::-webkit-inner-spin-button,
  &[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type="number"] {
    -moz-appearance: textfield;
  }
`;

// Blocks all non-digit keystrokes — browsers (especially Firefox) allow
// arbitrary letters in <input type="number"> without this guard.
const DIGIT_CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Enter",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

export function isNonDigitKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return !DIGIT_CONTROL_KEYS.has(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey;
}

export function NumberInput({ onKeyDown, ...props }: ComponentPropsWithoutRef<"input">) {
  return (
    <StyledInput
      {...props}
      type="number"
      onKeyDown={(e) => {
        if (isNonDigitKey(e)) e.preventDefault();

        onKeyDown?.(e);
      }}
    />
  );
}

export const PortTag = styled.span`
  display: inline-block;
  padding: 1px 6px;
  background: ${colors.accentBlueAlpha10};
  color: ${colors.accentBlue};
  border-radius: 4px;
  font-size: 0.65rem;
  font-family: "SF Mono", "Fira Code", monospace;
`;

export const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 199;
  background: ${colors.blackAlpha50};
`;

export const Section = styled.div`
  background: ${colors.bgCard};
  border: 1px solid ${colors.border};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
`;

export const StyledSelect = styled.select`
  width: 100%;
  padding: 8px 32px 8px 12px;
  border: 1px solid ${colors.border};
  border-radius: 6px;
  background: ${colors.bgPrimary};
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7290' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  color: ${colors.textPrimary};
  font-size: 0.85rem;
  outline: none;
  appearance: none;
  cursor: pointer;

  &:focus {
    border-color: ${colors.accentBlue};
  }
`;
