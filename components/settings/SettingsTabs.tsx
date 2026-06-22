"use client";

import { useState } from "react";
import { cn } from "@/lib/ui/cn";
import { AiSettings } from "@/components/settings/AiSettings";
import { PolicySettings } from "@/components/settings/PolicySettings";

/**
 * Settings section switcher (FR-SETTINGS-03, FR-CONTENT-08). Adds a Workflow
 * policy section alongside the existing AI provider section. Each section
 * renders its own PageHeader, so the tab strip sits above them. The shell nav
 * "Settings" item is unchanged.
 */
type Tab = "ai" | "policy";

const TABS: { id: Tab; label: string }[] = [
  { id: "ai", label: "AI provider" },
  { id: "policy", label: "Workflow policy" },
];

export function SettingsTabs() {
  const [tab, setTab] = useState<Tab>("ai");
  return (
    <div className="flex h-full flex-col">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 border-b border-line bg-paper-raised/60 px-6 pt-3"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-t-sm border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-mute hover:text-ink"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "ai" ? <AiSettings /> : <PolicySettings />}
      </div>
    </div>
  );
}
