"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/ui/cn";

const fieldBase =
  "w-full rounded-sm border border-line-strong bg-paper-raised px-3 text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25";

/** Wraps a labelled control with optional hint + error (NFR-A11Y-01). */
export function Label({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-[13px] font-medium text-ink-soft", className)}
    >
      {children}
    </label>
  );
}

export function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  errorId,
  children,
  className,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  /** id assigned to the rendered error so controls can aria-describedby it. */
  errorId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={htmlFor}>{label}</Label>
          {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, id, "aria-describedby": describedBy, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    // Associate the error message with the control for screen readers (WCAG 3.3.1).
    const describedByValue =
      [describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined;
    return (
      <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} errorId={errorId}>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByValue}
          className={cn(fieldBase, "h-10", className)}
          {...rest}
        />
      </FieldShell>
    );
  }
);
Input.displayName = "Input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className, id, rows = 3, "aria-describedby": describedBy, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const describedByValue =
      [describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined;
    return (
      <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} errorId={errorId}>
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByValue}
          className={cn(fieldBase, "py-2 leading-relaxed resize-y", className)}
          {...rest}
        />
      </FieldShell>
    );
  }
);
Textarea.displayName = "Textarea";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, className, id, children, "aria-describedby": describedBy, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const describedByValue =
      [describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined;
    return (
      <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} errorId={errorId}>
        <select
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByValue}
          className={cn(fieldBase, "h-10 cursor-pointer appearance-none pr-8", className)}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2379736a' stroke-width='2.5'><path d='M6 9l6 6 6-6'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.6rem center",
          }}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    );
  }
);
Select.displayName = "Select";
