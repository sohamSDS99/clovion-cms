"use client";

import { cn } from "@/lib/ui/cn";

/** Calm raised surface with a hairline border. */
export function Card({
  className,
  children,
  as: Tag = "div",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  as?: React.ElementType;
}) {
  return (
    <Tag
      className={cn(
        "rounded border border-line bg-paper-raised shadow-card",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-line px-5 py-4",
        className
      )}
    >
      <div>
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-ink-mute">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
