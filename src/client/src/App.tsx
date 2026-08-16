import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { CertificateHealthProvider } from "./context/CertificateHealthContext";
import { ConfigProvider } from "./context/ConfigContext";
import { ThemeProvider } from "./context/ThemeContext";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Discovery = lazy(() => import("./pages/Discovery"));
const Login = lazy(() => import("./pages/Login"));
const Services = lazy(() => import("./pages/Services"));
const Settings = lazy(() => import("./pages/Settings"));

function PageFallback() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center" aria-busy="true">
      <span className="text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Login />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <ConfigProvider>
                    <CertificateHealthProvider>
                      <Layout>
                        <Suspense fallback={<PageFallback />}>
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/services" element={<Services />} />
                            <Route path="/discover" element={<Discovery />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </Suspense>
                      </Layout>
                    </CertificateHealthProvider>
                  </ConfigProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
