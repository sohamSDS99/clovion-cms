import type { AgentRunStatus } from "@prisma/client";

export function runStatusLabel(status: AgentRunStatus): string {
  switch (status) {
    case "QUEUED": return "Queued";
    case "PLANNING": return "Planning";
    case "WRITING": return "Writing";
    case "QA": return "QA review";
    case "REVISING": return "Revising";
    case "READY": return "Ready";
    case "FAILED": return "Failed";
    case "CANCELLED": return "Stopped";
  }
}

import type { BadgeTone } from "@/lib/ui/format";

export function runStatusTone(status: AgentRunStatus): BadgeTone {
  switch (status) {
    case "READY": return "published";
    case "FAILED": return "unpublished";
    case "CANCELLED": return "neutral";
    case "QUEUED": return "neutral";
    default: return "review";
  }
}

export const ACTIVE_STATUSES: AgentRunStatus[] = [
  "QUEUED", "PLANNING", "WRITING", "QA", "REVISING",
];

export const PIPELINE_STAGES = [
  { key: "PLANNING", label: "Orchestrator planning & research" },
  { key: "WRITING", label: "Writer drafting" },
  { key: "QA", label: "QA reviewing" },
  { key: "REVISING", label: "Revising" },
] as const;
