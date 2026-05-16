import { createGlobalStyle } from "styled-components";

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    --bg-primary: #0f1117;
    --bg-secondary: #1a1d27;
    --bg-tertiary: #242836;
    --bg-card: #1e2230;
    --border-color: #2d3348;
    --text-primary: #e8eaf0;
    --text-secondary: #9ca3b8;
    --text-muted: #6b7290;
    --accent-blue: #3b82f6;
    --accent-green: #10b981;
    --accent-red: #ef4444;
    --accent-yellow: #f59e0b;
    --accent-purple: #8b5cf6;
    --accent-cyan: #06b6d4;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.5;
    overflow-x: hidden;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--bg-tertiary);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--border-color);
  }

  input, select, textarea, button {
    font-family: inherit;
  }
`;
