import { redirect } from "next/navigation";

/** Profile now lives under Settings → Profile Settings. */
export default function ProfilePage() {
  redirect("/settings?tab=profile");
}
