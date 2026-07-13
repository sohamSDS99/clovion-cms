import { RunDetail } from "@/components/contentagent/RunDetail";

export default async function ContentAgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RunDetail id={id} />;
}
