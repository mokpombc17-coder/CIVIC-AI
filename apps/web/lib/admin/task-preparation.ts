import type { TaskCapabilities, TaskPreparationView } from "@/lib/admin/domain-contracts";

export function taskPreparationPresentation(
  preparation: TaskPreparationView | null,
  capabilities: TaskCapabilities,
): Readonly<{
  label: string;
  description: string;
  tone: "idle" | "running" | "attention" | "completed";
  action: string | null;
}> {
  if (!preparation)
    return {
      label: "생성 전",
      tone: "idle",
      action: "답변 생성 시작",
      description: capabilities.canStartPreparation
        ? "투표 내용과 선택지를 확인한 뒤 AI 예상 답변을 생성해 주세요. 생성이 완료되면 투표를 발행할 수 있습니다."
        : "현재는 생성을 시작할 수 없습니다. 투표 내용과 상태를 확인해 주세요.",
    };
  if (preparation.status === "READY")
    return {
      label: "생성 완료",
      tone: "completed",
      action: null,
      description:
        capabilities.canSchedule || capabilities.canOpenNow
          ? "AI 예상 답변 준비가 완료되었습니다. 아래에서 투표를 바로 시작하거나 예약할 수 있습니다."
          : "AI 예상 답변 준비가 완료되었습니다.",
    };
  if (preparation.status === "REJECTED")
    return {
      label: "내용 확인 필요",
      tone: "attention",
      action: null,
      description: capabilities.canEditContent
        ? "현재 내용으로 생성할 수 없습니다. 오류 원인을 확인하고 투표 내용을 수정해 주세요."
        : "현재 내용으로 생성할 수 없습니다. 오류 원인과 투표 상태를 확인해 주세요.",
    };
  if (preparation.status === "FAILED" || capabilities.canStartPreparation)
    return {
      label: "재시도 필요",
      tone: "attention",
      action: "답변 생성 다시 시도",
      description: capabilities.canStartPreparation
        ? "생성이 완료되지 않았습니다. 다시 시도하면 최신 상태를 확인하고 생성을 요청합니다."
        : "생성이 완료되지 않았습니다. 현재는 재시도할 수 없으므로 잠시 후 상태를 확인해 주세요.",
    };
  return {
    label: "생성 중",
    tone: "running",
    action: null,
    description:
      "AI 예상 답변을 생성하고 있습니다. 상태는 자동으로 갱신되며, 다른 화면으로 이동해도 작업은 계속됩니다.",
  };
}
