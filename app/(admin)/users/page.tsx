import { redirect } from "next/navigation";

/** User management now lives under Settings → User Management. */
export default function UsersPage() {
  redirect("/settings?tab=users");
}
