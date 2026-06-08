import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

import { useAuth } from "../context/AuthContext";
import { discoveryApi } from "../services/api";
import { Icons } from "./Icons";

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
  const { enabled, user, logout } = useAuth();
  const [updateInfo, setUpdateInfo] = useState<{
    latestVersion: string;
    releaseUrl: string;
  } | null>(null);

  useEffect(() => {
    discoveryApi.checkAppUpdate().then(({ data }) => {
      if (!data.hasUpdate || !data.latestVersion || !data.releaseUrl) return;

      const dismissKey = `app-update-dismissed-${data.latestVersion}`;

      if (!localStorage.getItem(dismissKey)) {
        setUpdateInfo({ latestVersion: data.latestVersion, releaseUrl: data.releaseUrl });
      }
    });
  }, []);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 h-14 bg-muted/95 backdrop-blur-[12px] border-b border-border flex items-center px-6 z-[100]">
        <Link to="/" className="flex items-center gap-2 mr-10 text-xl font-bold no-underline">
          <Icons.Logo stroke="var(--primary)" />
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
        {enabled && user && (
          <div className="ml-auto flex items-center gap-3">
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
              className="px-3 py-1 text-xs font-medium rounded-md text-secondary-foreground hover:text-foreground hover:bg-primary/5 transition-colors cursor-pointer"
            >
              {t("nav.logout")}
            </button>
          </div>
        )}
      </nav>
      <main className="pt-14 min-h-screen">
        {updateInfo && (
          <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-warning/10 border-b border-warning/20 text-xs text-warning">
            <span>{t("nav.updateAvailable", { version: updateInfo.latestVersion })}</span>
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline text-warning hover:opacity-80 transition-opacity"
            >
              {t("nav.releaseNotes")} ↗
            </a>
            <button
              onClick={() => {
                localStorage.setItem(`app-update-dismissed-${updateInfo.latestVersion}`, "true");
                setUpdateInfo(null);
              }}
              className="ml-1 text-warning/70 hover:text-warning transition-colors"
              aria-label="Dismiss"
            >
              <Icons.X size={13} />
            </button>
          </div>
        )}
        {children}
      </main>
    </>
  );
}

export default Layout;
