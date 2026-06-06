import type { rawColors as _ref } from "./themes/dark.theme";

export type RawColors = { [K in keyof typeof _ref]: string };

type ThemeModule = { rawColors: RawColors };

const themeModules = import.meta.glob<ThemeModule>("./themes/*.theme.ts", { eager: true });

function keyFromPath(path: string): string {
  return path.replace(/^\.\/themes\//, "").replace(/\.theme\.ts$/, "");
}

function labelFromKey(key: string): string {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const themes: Record<string, { label: string; colors: RawColors }> = Object.fromEntries(
  Object.entries(themeModules).map(([path, mod]) => {
    const key = keyFromPath(path);

    return [key, { label: labelFromKey(key), colors: mod.rawColors }];
  }),
);

export const SYSTEM_THEME = "system";

export type ThemeName = string;
export type ThemeSelection = string;

export const themeSelections: Array<{ key: ThemeSelection; label: string }> = [
  { key: SYSTEM_THEME, label: "System" },
  ...Object.entries(themes).map(([key, { label }]) => ({ key, label })),
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyTheme(colors: RawColors): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--bg-primary": colors.bgPrimary,
    "--bg-secondary": colors.bgSecondary,
    "--bg-tertiary": colors.bgTertiary,
    "--bg-card": colors.bgCard,
    "--border-color": colors.border,
    "--border-hover": colors.borderHover,
    "--text-primary": colors.textPrimary,
    "--text-secondary": colors.textSecondary,
    "--text-muted": colors.textMuted,
    "--text-light": colors.textLight,
    "--accent-blue": colors.accentBlue,
    "--accent-blue-dark": colors.accentBlueDark,
    "--accent-blue-lighter": colors.accentBlueLighter,
    "--accent-green": colors.accentGreen,
    "--accent-green-lighter": colors.accentGreenLighter,
    "--accent-red": colors.accentRed,
    "--accent-red-dark": colors.accentRedDark,
    "--accent-yellow": colors.accentYellow,
    "--accent-purple": colors.accentPurple,
    "--accent-cyan": colors.accentCyan,
    "--accent-gray": colors.accentGray,
    "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.3)",
    "--shadow-md": "0 4px 12px rgba(0, 0, 0, 0.4)",
    "--shadow-lg": "0 8px 24px rgba(0, 0, 0, 0.5)",
    "--radius-sm": "6px",
    "--radius-md": "10px",
    "--radius-lg": "16px",
    "--bg-card-alpha-90": hexToRgba(colors.bgCard, 0.9),
    "--bg-secondary-alpha-95": hexToRgba(colors.bgSecondary, 0.95),
    "--accent-blue-alpha-05": hexToRgba(colors.accentBlue, 0.05),
    "--accent-blue-alpha-10": hexToRgba(colors.accentBlue, 0.1),
    "--accent-blue-alpha-15": hexToRgba(colors.accentBlue, 0.15),
    "--accent-blue-alpha-20": hexToRgba(colors.accentBlue, 0.2),
    "--accent-blue-alpha-30": hexToRgba(colors.accentBlue, 0.3),
    "--accent-blue-alpha-50": hexToRgba(colors.accentBlue, 0.5),
    "--accent-blue-lighter-alpha-60": hexToRgba(colors.accentBlueLighter, 0.6),
    "--accent-green-alpha-10": hexToRgba(colors.accentGreen, 0.1),
    "--accent-green-alpha-15": hexToRgba(colors.accentGreen, 0.15),
    "--accent-green-lighter-alpha-60": hexToRgba(colors.accentGreenLighter, 0.6),
    "--accent-red-alpha-15": hexToRgba(colors.accentRed, 0.15),
    "--accent-purple-alpha-10": hexToRgba(colors.accentPurple, 0.1),
    "--accent-yellow-alpha-10": hexToRgba(colors.accentYellow, 0.1),
    "--text-muted-alpha-15": hexToRgba(colors.textMuted, 0.15),
    "--black-alpha-20": "rgba(0, 0, 0, 0.2)",
    "--black-alpha-30": "rgba(0, 0, 0, 0.3)",
    "--black-alpha-40": "rgba(0, 0, 0, 0.4)",
    "--black-alpha-50": "rgba(0, 0, 0, 0.5)",
  };

  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
}
