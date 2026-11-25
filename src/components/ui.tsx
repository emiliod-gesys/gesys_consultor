import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  solid: "bg-teal text-ink hover:bg-[#07c4c6]",
  ghost: "border border-line bg-transparent text-paper hover:bg-panel-2",
  teal: "bg-teal-deep text-teal hover:bg-[#0c4749]",
  steel: "border border-steel/30 bg-steel-deep text-steel hover:bg-[#263540]",
  danger: "border border-teal/50 text-teal hover:bg-teal/10",
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClass(variant: ButtonVariant = "solid", className = ""): string {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`;
}

export function Button({
  variant = "solid",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export const fieldClass =
  "w-full rounded-2xl border border-line bg-ink px-3 py-3 text-base text-paper outline-none placeholder:text-muted/70";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
