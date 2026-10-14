import * as React from "react";

import { Icons } from "@/components/Icons";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <span className="relative inline-flex size-4 shrink-0 align-middle">
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className={cn(
        "peer m-0 size-4 cursor-pointer appearance-none rounded border border-input bg-background transition-colors checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary enabled:hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
    <Icons.Check
      size={12}
      strokeWidth={3}
      aria-hidden="true"
      className="pointer-events-none absolute left-0.5 top-0.5 text-primary-foreground opacity-0 peer-checked:opacity-100 peer-indeterminate:hidden"
    />
    <Icons.Minus
      size={12}
      strokeWidth={3}
      aria-hidden="true"
      className="pointer-events-none absolute left-0.5 top-0.5 text-primary-foreground opacity-0 peer-indeterminate:opacity-100"
    />
  </span>
));

Checkbox.displayName = "Checkbox";

export { Checkbox };
