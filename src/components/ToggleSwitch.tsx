import { useId } from "react";

import { cn } from "../lib/utils";

type ToggleTone = "light" | "dark";
type ToggleSize = "sm" | "md";

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  disabled?: boolean;
  tone?: ToggleTone;
  size?: ToggleSize;
  className?: string;
}

export function ToggleSwitch({
  checked,
  onToggle,
  ariaLabel,
  disabled = false,
  tone = "dark",
  size = "md",
  className,
}: ToggleSwitchProps) {
  const id = useId();

  return (
    <span
      className={cn("themed-toggle", disabled && "themed-toggle--disabled", className)}
      data-tone={tone}
      data-size={size}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <label htmlFor={id} />
    </span>
  );
}
