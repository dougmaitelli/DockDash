import { createGlobalStyle } from "styled-components";
import type { RawColors } from "./themes";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface GlobalStylesProps {
  $colors: RawColors;
}

export const GlobalStyles = createGlobalStyle<GlobalStylesProps>`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    --bg-primary: ${(p) => p.$colors.bgPrimary};
    --bg-secondary: ${(p) => p.$colors.bgSecondary};
    --bg-tertiary: ${(p) => p.$colors.bgTertiary};
    --bg-card: ${(p) => p.$colors.bgCard};
    --border-color: ${(p) => p.$colors.border};
    --border-hover: ${(p) => p.$colors.borderHover};
    --text-primary: ${(p) => p.$colors.textPrimary};
    --text-secondary: ${(p) => p.$colors.textSecondary};
    --text-muted: ${(p) => p.$colors.textMuted};
    --text-light: ${(p) => p.$colors.textLight};
    --accent-blue: ${(p) => p.$colors.accentBlue};
    --accent-blue-dark: ${(p) => p.$colors.accentBlueDark};
    --accent-blue-lighter: ${(p) => p.$colors.accentBlueLighter};
    --accent-green: ${(p) => p.$colors.accentGreen};
    --accent-green-lighter: ${(p) => p.$colors.accentGreenLighter};
    --accent-red: ${(p) => p.$colors.accentRed};
    --accent-red-dark: ${(p) => p.$colors.accentRedDark};
    --accent-yellow: ${(p) => p.$colors.accentYellow};
    --accent-purple: ${(p) => p.$colors.accentPurple};
    --accent-cyan: ${(p) => p.$colors.accentCyan};
    --accent-gray: ${(p) => p.$colors.accentGray};
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    /* Alpha variants */
    --bg-card-alpha-90: ${(p) => hexToRgba(p.$colors.bgCard, 0.9)};
    --bg-secondary-alpha-95: ${(p) => hexToRgba(p.$colors.bgSecondary, 0.95)};
    --accent-blue-alpha-05: ${(p) => hexToRgba(p.$colors.accentBlue, 0.05)};
    --accent-blue-alpha-10: ${(p) => hexToRgba(p.$colors.accentBlue, 0.1)};
    --accent-blue-alpha-15: ${(p) => hexToRgba(p.$colors.accentBlue, 0.15)};
    --accent-blue-alpha-20: ${(p) => hexToRgba(p.$colors.accentBlue, 0.2)};
    --accent-blue-alpha-30: ${(p) => hexToRgba(p.$colors.accentBlue, 0.3)};
    --accent-blue-alpha-50: ${(p) => hexToRgba(p.$colors.accentBlue, 0.5)};
    --accent-blue-lighter-alpha-60: ${(p) => hexToRgba(p.$colors.accentBlueLighter, 0.6)};
    --accent-green-alpha-10: ${(p) => hexToRgba(p.$colors.accentGreen, 0.1)};
    --accent-green-alpha-15: ${(p) => hexToRgba(p.$colors.accentGreen, 0.15)};
    --accent-green-lighter-alpha-60: ${(p) => hexToRgba(p.$colors.accentGreenLighter, 0.6)};
    --accent-red-alpha-15: ${(p) => hexToRgba(p.$colors.accentRed, 0.15)};
    --accent-purple-alpha-10: ${(p) => hexToRgba(p.$colors.accentPurple, 0.1)};
    --accent-yellow-alpha-10: ${(p) => hexToRgba(p.$colors.accentYellow, 0.1)};
    --text-muted-alpha-15: ${(p) => hexToRgba(p.$colors.textMuted, 0.15)};
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
