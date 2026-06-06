import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "px-4 py-2 text-sm font-medium rounded-md transition-all no-underline",
        active
          ? "text-primary bg-primary/10"
          : "text-secondary-foreground bg-transparent hover:text-foreground hover:bg-primary/5",
      )}
    >
      {children}
    </Link>
  );
}

function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 h-14 bg-muted/95 backdrop-blur-[12px] border-b border-border flex items-center px-6 z-[100]">
        <Link to="/" className="flex items-center gap-2 mr-10 text-xl font-bold no-underline">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
          >
            <rect x="2" y="3" width="20" height="18" rx="3" />
            <path d="M8 3v18" />
            <path d="M16 8h2" />
            <path d="M16 12h2" />
            <path d="M16 16h2" />
          </svg>
          <span
            className="bg-gradient-to-br from-primary to-primary/70 bg-clip-text"
            style={{ WebkitTextFillColor: "transparent" }}
          >
            DockDash
          </span>
        </Link>
        <div className="flex gap-1 h-full items-center">
          <NavLink to="/" active={location.pathname === "/"}>
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/discover" active={location.pathname === "/discover"}>
            {t("nav.discovery")}
          </NavLink>
          <NavLink to="/settings" active={location.pathname === "/settings"}>
            {t("nav.settings")}
          </NavLink>
        </div>
      </nav>
      <main className="pt-14 min-h-screen">{children}</main>
    </>
  );
}

export default Layout;
