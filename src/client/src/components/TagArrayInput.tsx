import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { isNonDigitKey } from "./NumberInput";
import { Icons } from "./Icons";
import { cn } from "@/lib/utils";

export interface TagArrayInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  validate?: (value: string, existing: string[]) => string | null;
  placeholder?: string;
  formatTag?: (value: string) => string;
  filterKey?: (e: KeyboardEvent<HTMLInputElement>) => boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

export function TagArrayInput({
  values,
  onChange,
  validate,
  placeholder,
  formatTag = (v) => v,
  filterKey,
  inputProps,
}: TagArrayInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();

    if (!trimmed) return;

    const err = validate ? validate(trimmed, values) : null;

    if (err) {
      setError(err);

      return;
    }

    onChange([...values, trimmed]);
    setInputValue("");
    setError("");
  };

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (filterKey && filterKey(e)) {
      e.preventDefault();
    }

    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="flex flex-col gap-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[0.8rem] text-primary font-mono"
            >
              {formatTag(v)}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="flex items-center text-secondary-foreground hover:text-destructive"
              >
                <Icons.X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2.5">
        <input
          {...inputProps}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "flex-1 min-w-[120px] px-3 py-2 border rounded-md bg-background text-foreground text-[0.85rem] outline-none focus:border-primary placeholder:text-muted-foreground",
            error ? "border-destructive" : "border-input",
          )}
        />
        <Button variant="outline" onClick={handleAdd}>
          <Icons.Plus size={14} />
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

interface NumberTagArrayInputProps extends Omit<TagArrayInputProps, "filterKey" | "inputProps"> {
  min?: number;
  max?: number;
}

export function NumberTagArrayInput({ min, max, ...props }: NumberTagArrayInputProps) {
  return (
    <TagArrayInput
      {...props}
      filterKey={isNonDigitKey}
      inputProps={{ type: "text", inputMode: "numeric", min, max }}
    />
  );
}
