import { useEffect, useMemo, useState } from "react";

import type { Service } from "@shared";
import { ServiceSource } from "@shared";

import { useTheme } from "@/context/ThemeContext";
import { getIconUrls, getServiceIconNames } from "@/lib/serviceIcons";
import { cn } from "@/lib/utils";

import { Icons } from "./Icons";

const resolvedUrlCache = new Map<string, string | null>();

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
  const cached = resolvedUrlCache.get(cacheKey);
  const initialIndex = cached ? Math.max(0, urls.indexOf(cached)) : 0;
  const [urlIndex, setUrlIndex] = useState(cached === null ? urls.length : initialIndex);

  useEffect(() => {
    const resolved = resolvedUrlCache.get(cacheKey);

    setUrlIndex(
      resolved === null ? urls.length : resolved ? Math.max(0, urls.indexOf(resolved)) : 0,
    );
  }, [cacheKey, urls]);

  const url = urls[urlIndex];

  if (!url) return fallbackForService(service, size);

  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="w-full h-full object-contain rounded-sm"
        onLoad={() => resolvedUrlCache.set(cacheKey, url)}
        onError={() => {
          const nextIndex = urlIndex + 1;

          if (nextIndex >= urls.length) resolvedUrlCache.set(cacheKey, null);

          setUrlIndex(nextIndex);
        }}
      />
    </span>
  );
}
