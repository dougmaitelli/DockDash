import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { DashboardConfig } from "@shared";
import axios from "axios";

const ConfigContext = createContext<DashboardConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    axios.get<DashboardConfig>("/api/config").then((res) => setConfig(res.data));
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
