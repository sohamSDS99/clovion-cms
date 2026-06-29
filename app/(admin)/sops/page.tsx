import { redirect } from "next/navigation";

/** Writing SOPs are now the master prompt under Settings → Writing Style. */
export default function SopsPage() {
  redirect("/settings?tab=writing");
}
