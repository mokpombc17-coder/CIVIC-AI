import { notFound } from "next/navigation";
import { AdminVoteSimulationScreen } from "@/components/admin/vote-simulation-workspace";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getScreenByRoute } from "@/lib/screens/registry";

type VoteSimulationPageProps = Readonly<{
  searchParams: Promise<{ taskId?: string | string[] }>;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// 투표 기반 시뮬레이션 전용 화면: 실제 투표(좌)·AI 시뮬레이션(우) 비교와 바로 실행을 한 화면에 둔다.
export default async function VoteSimulationPage({ searchParams }: VoteSimulationPageProps) {
  const { taskId: rawTaskId } = await searchParams;
  const taskId = typeof rawTaskId === "string" && uuid.test(rawTaskId) ? rawTaskId : null;
  await requireAdminAccess(
    "SIMULATION_ADMIN",
    taskId
      ? `/admin/simulations/vote?taskId=${encodeURIComponent(taskId)}`
      : "/admin/simulations/vote",
  );
  const screen = getScreenByRoute("/admin/simulations");
  if (!screen) notFound();
  return <AdminVoteSimulationScreen screen={screen} taskId={taskId} />;
}
