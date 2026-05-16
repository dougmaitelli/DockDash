import { useLocation, Link } from "react-router-dom";
import styled from "styled-components";

interface LayoutProps {
  children: React.ReactNode;
}

const Nav = styled.nav`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: rgba(26, 29, 39, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #2d3348;
  display: flex;
  align-items: center;
  padding: 0 24px;
  z-index: 100;
`;

const Logo = styled(Link)`
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b82f6;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 40px;

  span {
    background: linear-gradient(135deg, #3b82f6, #06b6d4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const NavLinks = styled.div`
  display: flex;
  gap: 4px;
  height: 100%;
  align-items: center;
`;

const NavLink = styled(Link).withConfig({
  shouldForwardProp: (prop) => !["active"].includes(prop),
})<{ active: boolean }>`
  padding: 8px 16px;
  color: ${(props) => (props.active ? "#3b82f6" : "#9ca3b8")};
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 6px;
  transition: all 0.15s;
  background: ${(props) => (props.active ? "rgba(59, 130, 246, 0.1)" : "transparent")};

  &:hover {
    color: #e8eaf0;
    background: rgba(59, 130, 246, 0.05);
  }
`;

const Content = styled.main`
  margin-top: 56px;
  min-height: calc(100vh - 56px);
`;

function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <>
      <Nav>
        <Logo to="/">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          >
            <rect x="2" y="3" width="20" height="18" rx="3" />
            <path d="M8 3v18" />
            <path d="M16 8h2" />
            <path d="M16 12h2" />
            <path d="M16 16h2" />
          </svg>
          <span>DockDash</span>
        </Logo>
        <NavLinks>
          <NavLink to="/" active={location.pathname === "/"}>
            Dashboard
          </NavLink>
          <NavLink to="/discover" active={location.pathname === "/discover"}>
            Discovery
          </NavLink>
          <NavLink to="/settings" active={location.pathname === "/settings"}>
            Settings
          </NavLink>
        </NavLinks>
      </Nav>
      <Content>{children}</Content>
    </>
  );
}

export default Layout;
