import { useState } from "react";

type FieldSchema = {
  required?: string;
  custom?: (value: string) => string | null;
};

type Schema = Record<string, FieldSchema>;
type Errors<S extends Schema> = Partial<Record<keyof S, string>>;

export function useFormValidation<S extends Schema>(schema: S) {
  const [errors, setErrors] = useState<Errors<S>>({});

  function validate(values: Partial<Record<keyof S, string>>): boolean {
    const next: Errors<S> = {};

    for (const field of Object.keys(schema) as (keyof S)[]) {
      const rule = schema[field];
      const value = String(values[field] ?? "");

      if (rule.required && !value.trim()) {
        next[field] = rule.required;
        continue;
      }

      if (rule.custom) {
        const msg = rule.custom(value);

        if (msg) next[field] = msg;
      }
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof S) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return { errors, validate, clearError };
}
