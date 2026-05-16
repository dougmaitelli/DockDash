import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { GlobalStyles } from "./styles/GlobalStyles";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Discovery from "./pages/Discovery";
import Settings from "./pages/Settings";

const theme = {
  colors: {
    bg: "#0f1117",
    surface: "#1a1d27",
    border: "#2d3348",
    text: "#e8eaf0",
    textSecondary: "#9ca3b8",
    accent: "#3b82f6",
  },
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/discover" element={<Discovery />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
