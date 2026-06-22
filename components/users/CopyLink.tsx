"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Read-only invite link with a copy-to-clipboard affordance (FR-USER-01).
 * Important when SMTP isn't configured: the Admin copies the link manually.
 */
export function CopyLink({ url, label = "Copy" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the input is selectable as a fallback.
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-paper-sunken px-3 text-xs text-ink-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        aria-label="Invite link"
      />
      <Button variant="secondary" size="sm" onClick={copy} type="button">
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}
