import { SettingsTabs } from "@/components/settings/SettingsTabs";

/**
 * Settings: AI provider configuration (FR-SETTINGS-03) and org workflow policy
 * (FR-CONTENT-08). SOPs live at /sops. The tab strip switches sections without
 * changing the shell nav.
 */
export default function SettingsPage() {
  return <SettingsTabs />;
}
