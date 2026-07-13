import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsTabs, type SettingsTab } from "@/components/settings/SettingsTabs";

const TAB_VALUES: SettingsTab[] = ["profile", "writing", "ai", "users"];

/**
 * Settings: a single page with three role-gated tabs — Profile Settings,
 * Writing Style (master AI prompt), and User Management. Deep-linkable via
 * ?tab=. The shell gate already requires a session; APIs enforce real authz.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { tab } = await searchParams;
  const initialTab = TAB_VALUES.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : "profile";

  return (
    <SettingsTabs
      user={{
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name ?? null,
        role: session.user.role,
      }}
      initialTab={initialTab}
    />
  );
}
