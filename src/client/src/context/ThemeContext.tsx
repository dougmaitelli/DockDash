import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

import type { RawColors, ThemeName, ThemeSelection } from "../styles/themes";
import { applyTheme, SYSTEM_THEME, themes } from "../styles/themes";

const STORAGE_KEY = "dockdash-theme";

interface ThemeContextValue {
  theme: ThemeSelection;
  colors: RawColors;
  setTheme: (theme: ThemeSelection) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: SYSTEM_THEME,
  colors: themes["dark"].colors,
  setTheme: () => {},
});

function getSystemTheme(): ThemeName {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ThemeSelection>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored !== null && stored in themes) {
      return stored as ThemeSelection;
    }

    return SYSTEM_THEME;
  });

  const [systemTheme, setSystemTheme] = useState<ThemeName>(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(getSystemTheme());

    mq.addEventListener("change", handler);

    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = (t: ThemeSelection) => {
    setSelection(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  const resolvedTheme = selection === SYSTEM_THEME ? systemTheme : (selection as ThemeName);

  useLayoutEffect(() => {
    applyTheme(themes[resolvedTheme].colors);
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider
      value={{ theme: selection, colors: themes[resolvedTheme].colors, setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
