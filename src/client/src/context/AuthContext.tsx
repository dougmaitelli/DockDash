import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

import { authApi } from "../services/api";

interface AuthUser {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

interface AuthState {
  enabled: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  enabled: false,
  user: null,
  isLoading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void authApi
      .getState()
      .then((res) => {
        setEnabled(res.data.enabled);
        setUser(res.data.user);
      })
      .catch(() => {
        setEnabled(false);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ enabled, user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
