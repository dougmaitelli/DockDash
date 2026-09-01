import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { normalizeServiceLabel, SERVICE_LABEL_MAX_COUNT, SERVICE_LABEL_MAX_LENGTH } from "@shared";

import { getServiceLabelColorStyle } from "@/lib/serviceLabelColors";
import { cn } from "@/lib/utils";

import { Icons } from "./Icons";

interface ServiceLabelInputProps {
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
}

export function ServiceLabelInput({ values, suggestions, onChange }: ServiceLabelInputProps) {
  const { t } = useTranslation();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => new Set(values.map((value) => normalizeServiceLabel(value))),
    [values],
  );
  const availableSuggestions = useMemo(() => {
    const query = normalizeServiceLabel(inputValue);

    return suggestions
      .filter((suggestion) => !selected.has(normalizeServiceLabel(suggestion)))
      .filter((suggestion) => !query || normalizeServiceLabel(suggestion).includes(query))
      .slice(0, 8);
  }, [inputValue, selected, suggestions]);
  const canCreate =
    inputValue.trim().length > 0 &&
    !selected.has(normalizeServiceLabel(inputValue)) &&
    !availableSuggestions.some(
      (suggestion) => normalizeServiceLabel(suggestion) === normalizeServiceLabel(inputValue),
    );
  const options = canCreate ? [...availableSuggestions, inputValue.trim()] : availableSuggestions;

  const addLabel = (label: string) => {
    const trimmed = label.trim();

    if (!trimmed) return;

    if (trimmed.length > SERVICE_LABEL_MAX_LENGTH) {
      setError(t("modals.labelTooLong", { count: SERVICE_LABEL_MAX_LENGTH }));

      return;
    }

    if (values.length >= SERVICE_LABEL_MAX_COUNT) {
      setError(t("modals.labelLimit", { count: SERVICE_LABEL_MAX_COUNT }));

      return;
    }

    if (selected.has(normalizeServiceLabel(trimmed))) {
      setError(t("modals.labelDuplicate"));

      return;
    }

    onChange([...values, trimmed]);
    setInputValue("");
    setError("");
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      addLabel(options[activeIndex] ?? inputValue);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative flex flex-col gap-2"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={normalizeServiceLabel(value)}
              style={getServiceLabelColorStyle(value)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8rem]"
            >
              {value}
              <button
                type="button"
                aria-label={t("modals.removeLabel", { label: value })}
                onClick={() =>
                  onChange(
                    values.filter(
                      (candidate) =>
                        normalizeServiceLabel(candidate) !== normalizeServiceLabel(value),
                    ),
                  )
                }
                className="flex items-center text-secondary-foreground hover:text-destructive"
              >
                <Icons.X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={inputValue}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open && options.length > 0}
        aria-activedescendant={
          open && options.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        disabled={values.length >= SERVICE_LABEL_MAX_COUNT}
        maxLength={SERVICE_LABEL_MAX_LENGTH + 1}
        placeholder={t("modals.labelsPlaceholder")}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setInputValue(event.target.value);
          setError("");
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "min-w-[120px] rounded-md border bg-background px-3 py-2 text-[0.85rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-destructive" : "border-input",
        )}
      />

      {open && options.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isCreate = canCreate && index === options.length - 1;

            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={`${normalizeServiceLabel(option)}-${isCreate ? "create" : "existing"}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => addLabel(option)}
                className={cn(
                  "flex w-full items-center rounded px-2.5 py-2 text-left text-sm",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent",
                )}
              >
                {isCreate ? t("modals.createLabel", { label: option }) : option}
              </button>
            );
          })}
        </div>
      )}

      {error && <span className="text-xs text-destructive">{error}</span>}
      {values.length >= SERVICE_LABEL_MAX_COUNT && (
        <span className="text-xs text-muted-foreground">
          {t("modals.labelLimit", { count: SERVICE_LABEL_MAX_COUNT })}
        </span>
      )}
    </div>
  );
}
