import styled from "styled-components";
import { colors } from "../styles/theme";

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
`;

export const PrimaryButton = styled(ActionButton)`
  background: ${colors.accentBlue};
  color: white;

  &:hover {
    background: ${colors.accentBlueDark};
  }
`;

export const SecondaryButton = styled(ActionButton)`
  background: transparent;
  border: 1px solid ${colors.border};
  color: ${colors.textSecondary};

  &:hover {
    border-color: ${colors.accentBlue};
    color: ${colors.accentBlue};
  }
`;

export const DangerButton = styled(ActionButton)`
  background: ${colors.accentRed};
  color: white;

  &:hover {
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
