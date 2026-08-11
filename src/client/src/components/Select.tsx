import type { ReactNode } from "react";

import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export interface SelectOption {
  value: string;
  label: ReactNode;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  ariaLabel?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  ariaLabel,
}: SelectProps) {
  return (
    <SelectRoot value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
