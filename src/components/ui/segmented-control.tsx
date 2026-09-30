"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

type SegmentedControlProps<T extends string> = {
  options: readonly Option<T>[];
  value: T | string;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  tone?: "light" | "primary";
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
  ariaLabelledBy,
  tone = "light",
  className
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      className={cn("segmented-control relative grid gap-1 rounded-md bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {activeIndex >= 0 ? (
        <span
          aria-hidden="true"
          className={cn("segmented-indicator pointer-events-none rounded-sm", tone === "primary" ? "segmented-indicator-primary" : "segmented-indicator-light")}
          style={{ gridColumn: 1, gridRow: 1, transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))` }}
        />
      ) : null}
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}
          style={{ gridColumn: index + 1, gridRow: 1 }}
          className={cn(
            "relative z-10 flex min-h-9 items-center justify-center gap-1.5 rounded-sm px-1.5 text-xs font-semibold transition-[color,transform] duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? tone === "primary" ? "text-primary-foreground" : "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
