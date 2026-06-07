import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import axios from "axios";

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
    axios
      .get<{ enabled: boolean; user: AuthUser | null }>("/auth/me")
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
    await axios.post("/auth/logout");
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
