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

export type ThemeName = string;
export type ThemeSelection = string;

export const themeSelections: Array<{ key: ThemeSelection; label: string }> = [
  { key: "system", label: "System" },
  ...Object.entries(themes).map(([key, { label }]) => ({ key, label })),
];
