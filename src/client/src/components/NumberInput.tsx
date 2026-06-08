import type { ComponentPropsWithoutRef } from "react";

import { Input } from "@/components/ui/Input";

// Blocks all non-digit keystrokes — browsers (especially Firefox) allow
// arbitrary letters in <input type="number"> without this guard.
const DIGIT_CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Enter",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

export function isNonDigitKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return !DIGIT_CONTROL_KEYS.has(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey;
}

export function NumberInput({ onKeyDown, ...props }: ComponentPropsWithoutRef<"input">) {
  return (
    <Input
      {...props}
      type="number"
      onKeyDown={(e) => {
        if (isNonDigitKey(e)) e.preventDefault();

        onKeyDown?.(e);
      }}
    />
  );
}
