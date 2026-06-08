import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

import type { DashboardConfig } from "@shared";

const ConfigContext = createContext<DashboardConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    axios.get<DashboardConfig>("/api/config").then((res) => setConfig(res.data));
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
