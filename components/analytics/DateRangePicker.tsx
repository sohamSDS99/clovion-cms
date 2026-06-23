"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/** A dependency-free month calendar for picking a [from, to] date range. */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(d: Date) {
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function atStartOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function shortLabel(d: Date) {
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

export function DateRangePicker({
  initialFrom,
  initialTo,
  onApply,
  onClose,
}: {
  initialFrom: Date | null;
  initialTo: Date | null;
  onApply: (from: Date, to: Date) => void;
  onClose: () => void;
}) {
  const today = atStartOfDay(new Date());
  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);
  const [view, setView] = useState<Date>(
    atStartOfDay(initialTo ?? initialFrom ?? new Date())
  );
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function pick(day: Date) {
    if (day > today) return; // analytics is historical; no future dates
    if (!from || (from && to)) {
      // start a new range
      setFrom(day);
      setTo(null);
    } else if (day < from) {
      setFrom(day);
    } else {
      setTo(day);
    }
  }

  function shiftMonth(delta: number) {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function inRange(day: Date) {
    if (!from) return false;
    const end = to ?? from;
    return day >= from && day <= end;
  }

  // Build the calendar grid for the current view month.
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const leadingBlanks = first.getDay();
  const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Select a custom date range"
      className="clv-pop-in absolute right-0 top-full z-30 mt-2 w-[300px] rounded border border-line bg-paper-raised p-3 shadow-pop"
    >
      {/* Month header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded p-1 text-ink-mute hover:bg-paper-sunken hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-medium text-ink">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded p-1 text-ink-mute hover:bg-paper-sunken hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-ink-faint">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1">{w}</span>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const disabled = day > today;
          const isEnd = (from && sameDay(day, from)) || (to && sameDay(day, to));
          const within = inRange(day);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => pick(day)}
              aria-label={shortLabel(day)}
              className={[
                "h-8 rounded-[4px] text-[13px] transition-colors",
                disabled ? "cursor-not-allowed text-ink-faint/40" : "hover:bg-paper-sunken",
                isEnd ? "bg-accent font-semibold text-white hover:bg-accent" : within ? "bg-accent-soft text-accent-ink" : "text-ink-soft",
              ].join(" ")}
            >
              {ymd(day).d}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-xs text-ink-mute">
          {from ? shortLabel(from) : "Start"} → {to ? shortLabel(to) : from ? "End" : "—"}
        </span>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!from}
            onClick={() => from && onApply(from, to ?? from)}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
