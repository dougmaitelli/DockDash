import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export interface SortState<T> {
  column: T;
  direction: SortDirection;
}

export function SortHeader<T extends string>({
  col,
  label,
  width,
  value,
  onChange,
}: {
  col: T;
  label: string;
  width?: string;
  value: SortState<T>;
  onChange: (value: SortState<T>) => void;
}) {
  const isActive = value.column === col;
  const handleClick = () => {
    if (isActive) {
      onChange({ column: col, direction: value.direction === "asc" ? "desc" : "asc" });
    } else {
      onChange({ column: col, direction: "asc" });
    }
  };

  return (
    <th
      className={cn(
        "px-4 py-2.5 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
        width,
      )}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={cn("text-[0.65rem]", isActive ? "opacity-100" : "opacity-30")}>
          {isActive ? (value.direction === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </span>
    </th>
  );
}

export interface FilterCycleEntry<T> {
  value: T;
  activeClass?: string;
  dotClass?: string;
  title?: string;
}

const DEFAULT_ACTIVE_CLASS = "text-warning hover:text-warning/80";
const DEFAULT_DOT_CLASS = "bg-warning";

export function FilterHeader<T>({
  label,
  width,
  value,
  onChange,
  filterCycle,
}: {
  label: string;
  width?: string;
  value: T;
  onChange: (value: T) => void;
  filterCycle: FilterCycleEntry<T>[];
}) {
  const i = filterCycle.findIndex((e) => e.value === value);
  const entry = filterCycle[i] ?? filterCycle[0];
  const active = i > 0;
  const next = filterCycle[(i + 1) % filterCycle.length];

  return (
    <th
      className={cn(
        "px-4 py-2.5 font-medium cursor-pointer select-none transition-colors",
        width,
        active ? (entry.activeClass ?? DEFAULT_ACTIVE_CLASS) : "hover:text-foreground",
      )}
      title={entry.title}
      onClick={() => onChange(next.value)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full",
              entry.dotClass ?? DEFAULT_DOT_CLASS,
            )}
          />
        )}
      </span>
    </th>
  );
}
