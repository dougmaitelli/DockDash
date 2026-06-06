import type { ComponentPropsWithoutRef } from "react";

export function PortTag({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={`inline-block px-1.5 py-px bg-primary/10 text-primary rounded text-[0.65rem] font-mono${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
