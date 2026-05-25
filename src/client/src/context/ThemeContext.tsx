import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { GlobalStyles } from "../styles/GlobalStyles";
import { themes } from "../styles/themes";
import type { ThemeName, ThemeSelection } from "../styles/themes";

const STORAGE_KEY = "dockdash-theme";

interface ThemeContextValue {
  theme: ThemeSelection;
  setTheme: (theme: ThemeSelection) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
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

    return "system";
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

  const resolved = selection === "system" ? systemTheme : selection;

  return (
    <ThemeContext.Provider value={{ theme: selection, setTheme }}>
      <GlobalStyles $colors={themes[resolved].colors} />
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
