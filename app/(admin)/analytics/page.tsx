import { AnalyticsDashboard } from "./AnalyticsDashboard";

/**
 * Analytics (Phase 3): AI budget / usage / grounding dashboard (FR-ANALYTICS).
 * Server shell renders the client dashboard, which fetches /api/analytics/ai.
 * The API enforces the real Admin/Editor gate (view_audit_log).
 */
export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
