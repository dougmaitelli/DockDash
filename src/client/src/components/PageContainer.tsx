import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full min-w-0 max-w-6xl p-6 xl:max-w-screen-2xl", className)}
      {...props}
    />
  );
}
