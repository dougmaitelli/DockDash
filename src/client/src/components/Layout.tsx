import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import type { ChangelogRelease } from "@shared";

import { cn } from "@/lib/utils";

import { useAuth } from "../context/AuthContext";
import { discoveryApi } from "../services/api";
import { Icons } from "./Icons";
import { AppChangelogModal } from "./modals/AppChangelogModal";

interface LayoutProps {
  children: React.ReactNode;
}

function useTransitionNavigate() {
  const navigate = useNavigate();

  return (to: string) => {
    if (!document.startViewTransition) {
      navigate(to);

      return;
    }

    document.startViewTransition(() => {
      flushSync(() => navigate(to));
    });
  };
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
  const navigate = useTransitionNavigate();

  return (
    <Link
      to={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
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
  const { enabled, user, logout } = useAuth();
  const [updateInfo, setUpdateInfo] = useState<ChangelogRelease | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    discoveryApi.checkAppUpdate().then(({ data }) => {
      if (!data.hasUpdate || !data.release) return;

      const dismissKey = `app-update-dismissed-${data.release.version}`;

      if (!localStorage.getItem(dismissKey)) {
        setUpdateInfo(data.release);
      }
    });
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navigate = useTransitionNavigate();

  const navLinks = (
    <>
      <NavLink to="/" active={location.pathname === "/"}>
        {t("nav.dashboard")}
      </NavLink>
      <NavLink to="/services" active={location.pathname === "/services"}>
        {t("nav.services")}
      </NavLink>
      <NavLink to="/discover" active={location.pathname === "/discover"}>
        {t("nav.discovery")}
      </NavLink>
      <NavLink to="/settings" active={location.pathname === "/settings"}>
        {t("nav.settings")}
      </NavLink>
    </>
  );

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 h-14 bg-muted/95 backdrop-blur-[12px] border-b border-border flex items-center px-6 z-[100]">
        <Link
          to="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="flex items-center gap-2 mr-10 text-xl font-bold no-underline"
        >
          <Icons.Logo stroke="var(--primary)" />
          <span
            className="bg-gradient-to-br from-primary to-primary/70 bg-clip-text"
            style={{ WebkitTextFillColor: "transparent" }}
          >
            DockDash
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex gap-1 h-full items-center">{navLinks}</div>

        {/* Right side: desktop auth + mobile hamburger */}
        <div className="ml-auto flex items-center gap-3">
          {enabled && user && (
            <>
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name ?? user.email ?? ""}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                  {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-secondary-foreground hidden sm:block">
                {user.name ?? user.email}
              </span>
              <button
                onClick={logout}
                className="hidden sm:block px-3 py-1 text-xs font-medium rounded-md text-secondary-foreground hover:text-foreground hover:bg-primary/5 transition-colors cursor-pointer"
              >
                {t("nav.logout")}
              </button>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-secondary-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <Icons.X size={18} /> : <Icons.Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed top-14 left-0 right-0 bg-muted/95 backdrop-blur-[12px] border-b border-border z-[99] flex flex-col p-2">
          {navLinks}
          {enabled && user && (
            <div className="border-t border-border mt-2 pt-2 px-2 flex items-center justify-between">
              <span className="text-sm text-secondary-foreground">{user.name ?? user.email}</span>
              <button
                onClick={logout}
                className="px-3 py-1 text-xs font-medium rounded-md text-secondary-foreground hover:text-foreground hover:bg-primary/5 transition-colors cursor-pointer"
              >
                {t("nav.logout")}
              </button>
            </div>
          )}
        </div>
      )}

      <main className="pt-14 min-h-screen">
        {updateInfo && (
          <div className="relative flex items-center justify-center gap-3 px-4 py-2 bg-warning/10 border-b border-warning/20 text-xs text-warning">
            <span>{t("nav.updateAvailable", { version: updateInfo.version })}</span>
            <button
              onClick={() => setChangelogOpen(true)}
              className="underline text-warning hover:opacity-80 transition-opacity"
            >
              {t("nav.releaseNotes")}
            </button>
            <button
              onClick={() => {
                localStorage.setItem(`app-update-dismissed-${updateInfo.version}`, "true");
                setUpdateInfo(null);
              }}
              className="absolute right-4 text-warning/70 hover:text-warning transition-colors"
              aria-label="Dismiss"
            >
              <Icons.X size={13} />
            </button>
          </div>
        )}
        {changelogOpen && updateInfo && (
          <AppChangelogModal release={updateInfo} onClose={() => setChangelogOpen(false)} />
        )}
        {children}
      </main>
    </>
  );
}

export default Layout;
