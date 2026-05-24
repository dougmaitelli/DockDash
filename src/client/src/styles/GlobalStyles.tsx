import { createGlobalStyle } from "styled-components";
import { rawColors } from "./theme";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    --bg-primary: ${rawColors.bgPrimary};
    --bg-secondary: ${rawColors.bgSecondary};
    --bg-tertiary: ${rawColors.bgTertiary};
    --bg-card: ${rawColors.bgCard};
    --border-color: ${rawColors.border};
    --border-hover: ${rawColors.borderHover};
    --text-primary: ${rawColors.textPrimary};
    --text-secondary: ${rawColors.textSecondary};
    --text-muted: ${rawColors.textMuted};
    --text-light: ${rawColors.textLight};
    --accent-blue: ${rawColors.accentBlue};
    --accent-blue-dark: ${rawColors.accentBlueDark};
    --accent-blue-lighter: ${rawColors.accentBlueLighter};
    --accent-green: ${rawColors.accentGreen};
    --accent-green-lighter: ${rawColors.accentGreenLighter};
    --accent-red: ${rawColors.accentRed};
    --accent-red-dark: ${rawColors.accentRedDark};
    --accent-yellow: ${rawColors.accentYellow};
    --accent-purple: ${rawColors.accentPurple};
    --accent-cyan: ${rawColors.accentCyan};
    --accent-gray: ${rawColors.accentGray};
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    /* Alpha variants */
    --bg-card-alpha-90: ${hexToRgba(rawColors.bgCard, 0.9)};
    --bg-secondary-alpha-95: ${hexToRgba(rawColors.bgSecondary, 0.95)};
    --accent-blue-alpha-05: ${hexToRgba(rawColors.accentBlue, 0.05)};
    --accent-blue-alpha-10: ${hexToRgba(rawColors.accentBlue, 0.1)};
    --accent-blue-alpha-15: ${hexToRgba(rawColors.accentBlue, 0.15)};
    --accent-blue-alpha-20: ${hexToRgba(rawColors.accentBlue, 0.2)};
    --accent-blue-alpha-30: ${hexToRgba(rawColors.accentBlue, 0.3)};
    --accent-blue-alpha-50: ${hexToRgba(rawColors.accentBlue, 0.5)};
    --accent-blue-lighter-alpha-60: ${hexToRgba(rawColors.accentBlueLighter, 0.6)};
    --accent-green-alpha-10: ${hexToRgba(rawColors.accentGreen, 0.1)};
    --accent-green-alpha-15: ${hexToRgba(rawColors.accentGreen, 0.15)};
    --accent-green-lighter-alpha-60: ${hexToRgba(rawColors.accentGreenLighter, 0.6)};
    --accent-red-alpha-15: ${hexToRgba(rawColors.accentRed, 0.15)};
    --accent-purple-alpha-10: ${hexToRgba(rawColors.accentPurple, 0.1)};
    --accent-yellow-alpha-10: ${hexToRgba(rawColors.accentYellow, 0.1)};
    --text-muted-alpha-15: ${hexToRgba(rawColors.textMuted, 0.15)};
    --black-alpha-20: rgba(0, 0, 0, 0.2);
    --black-alpha-30: rgba(0, 0, 0, 0.3);
    --black-alpha-40: rgba(0, 0, 0, 0.4);
    --black-alpha-50: rgba(0, 0, 0, 0.5);
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.5;
    overflow-x: hidden;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--bg-tertiary);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--border-color);
  }

  input, select, textarea, button {
    font-family: inherit;
  }
`;
