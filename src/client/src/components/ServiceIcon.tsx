import { useEffect, useMemo, useState } from "react";

import type { Service } from "@shared";
import { ServiceSource } from "@shared";

import { useTheme } from "@/context/ThemeContext";
import { getIconUrls, getServiceIconNames, resolveServiceIcon } from "@/lib/serviceIcons";
import { cn } from "@/lib/utils";

import { Icons } from "./Icons";

function fallbackForService(service: Service, size: number) {
  if (service.source === ServiceSource.DOCKER) {
    return <Icons.Docker size={size} className="text-muted-foreground shrink-0" />;
  }

  if (service.source === ServiceSource.KUBERNETES) {
    return <Icons.Server size={size} className="text-muted-foreground shrink-0" />;
  }

  return <Icons.Globe size={size} className="text-muted-foreground shrink-0" />;
}

export function ServiceIcon({
  service,
  size = 18,
  className,
}: {
  service: Service;
  size?: number;
  className?: string;
}) {
  const { theme } = useTheme();
  const darkMode =
    theme !== "light" &&
    (theme !== "system" || window.matchMedia("(prefers-color-scheme: dark)").matches);
  const names = getServiceIconNames(service);
  const namesKey = names.join("|");
  const cacheKey = `${darkMode ? "dark" : "light"}:${namesKey}`;
  const urls = useMemo(
    () => getIconUrls(namesKey ? namesKey.split("|") : [], darkMode),
    [namesKey, darkMode],
  );
  const [resolved, setResolved] = useState<{ key: string; url: string | null }>();

  useEffect(() => {
    let active = true;

    void resolveServiceIcon(urls).then((url) => {
      if (active) setResolved({ key: cacheKey, url });
    });

    return () => {
      active = false;
    };
  }, [cacheKey, urls]);

  const url = resolved?.key === cacheKey ? resolved.url : null;

  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-contain rounded-sm"
          onError={() => setResolved({ key: cacheKey, url: null })}
        />
      ) : (
        fallbackForService(service, size)
      )}
    </span>
  );
}
