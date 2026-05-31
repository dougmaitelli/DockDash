import { useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { colors } from "../styles/vars";
import { SecondaryButton, isNonDigitKey } from "./ui";
import { IconPlus, IconX } from "./Icons";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Tag = styled.span`
  padding: 4px 12px;
  background: ${colors.accentBlueAlpha10};
  border: 1px solid ${colors.accentBlueAlpha20};
  border-radius: 16px;
  font-size: 0.8rem;
  color: ${colors.accentBlue};
  font-family: "SF Mono", "Fira Code", monospace;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  color: ${colors.textSecondary};
  cursor: pointer;
  padding: 0;
  line-height: 1;
  display: flex;
  align-items: center;

  &:hover {
    color: ${colors.accentRed};
  }
`;

const InputRow = styled.div`
  display: flex;
  gap: 10px;
`;

export const TagInput = styled.input`
  flex: 1;
  min-width: 120px;
  padding: 8px 12px;
  border: 1px solid ${colors.border};
  border-radius: 6px;
  background: ${colors.bgPrimary};
  color: ${colors.textPrimary};
  font-size: 0.85rem;
  outline: none;

  &:focus {
    border-color: ${colors.accentBlue};
  }
`;

const ErrorText = styled.span`
  font-size: 0.75rem;
  color: ${colors.accentRed};
`;

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
    <Container>
      {values.length > 0 && (
        <TagsRow>
          {values.map((v, i) => (
            <Tag key={i}>
              {formatTag(v)}
              <RemoveButton onClick={() => handleRemove(i)}>
                <IconX size={12} />
              </RemoveButton>
            </Tag>
          ))}
        </TagsRow>
      )}
      <InputRow>
        <TagInput
          {...inputProps}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={error ? { borderColor: colors.accentRed } : undefined}
        />
        <SecondaryButton onClick={handleAdd}>
          <IconPlus size={14} />
        </SecondaryButton>
      </InputRow>
      {error && <ErrorText>{error}</ErrorText>}
    </Container>
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
