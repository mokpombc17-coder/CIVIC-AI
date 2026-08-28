export const PUBLISHING_ACTIVE_TASK_ID = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";
export const PUBLISHING_COMPLETED_TASK_ID = "727c24f5-7c05-4730-912c-5bb6327c6590";

export type VotePublishingListItem = Readonly<{
  taskId: string;
  statusLabel: "진행 중" | "완료";
  title: string;
  supportingText: string;
  actionLabel: "참여하기" | "결과보기";
  actionHref: `/vote/${string}`;
}>;

export const votePublishingActiveList: readonly VotePublishingListItem[] = [
  {
    taskId: PUBLISHING_ACTIVE_TASK_ID,
    statusLabel: "진행 중",
    title: "청년 주거 지원 정책",
    supportingText: "내일 오후 11:59 마감",
    actionLabel: "참여하기",
    actionHref: `/vote/${PUBLISHING_ACTIVE_TASK_ID}`,
  },
  {
    taskId: PUBLISHING_COMPLETED_TASK_ID,
    statusLabel: "완료",
    title: "지역 교통 개선안",
    supportingText: "결과 확인 가능",
    actionLabel: "결과보기",
    actionHref: `/vote/${PUBLISHING_COMPLETED_TASK_ID}/result`,
  },
] as const;

export const votePublishingCompletedList: readonly VotePublishingListItem[] = [
  votePublishingActiveList[1]!,
] as const;

export type VotePublishingOption = Readonly<{
  id: string;
  label: string;
  content: string;
}>;

export type VotePublishingReason = Readonly<{
  id: string;
  optionId: string;
  label: string;
  content: string;
}>;

export const votePublishingTask = Object.freeze({
  taskId: PUBLISHING_ACTIVE_TASK_ID,
  background: "청년 주거 지원 정책 도입",
  question: "청년 주거 지원 확대 방식을 선택해 주세요.",
  deadline: "8/17(월) 오후 11:59",
  options: [
    { id: "option-1", label: "응답 선택지 1", content: "즉시 시행" },
    { id: "option-2", label: "응답 선택지 2", content: "단계적으로 시행" },
    { id: "option-3", label: "응답 선택지 3", content: "현행 유지" },
    { id: "option-4", label: "응답 선택지 4", content: "추가 검토" },
  ] satisfies readonly VotePublishingOption[],
  reasons: [
    {
      id: "reason-1",
      optionId: "option-2",
      label: "AI 예상 이유 1",
      content: "효과를 확인하며 지원 대상을 넓히는 편이 안정적입니다.",
    },
    {
      id: "reason-2",
      optionId: "option-2",
      label: "AI 예상 이유 2",
      content: "시범 운영 결과를 반영해 제도를 보완하며 확대할 수 있습니다.",
    },
  ] satisfies readonly VotePublishingReason[],
  confirmationReason: "효과와 재정 부담을 확인하며 지원 대상을 넓히는 편이 안정적입니다.",
  reasonMaxLength: 500,
});

export const votePublishingResult = Object.freeze({
  taskId: PUBLISHING_COMPLETED_TASK_ID,
  title: "지역 교통 개선안",
  question: "청년 주거 지원 확대 방식을 선택해 주세요.",
  responseCount: 128,
  options: [
    { id: "result-option-1", content: "즉시 시행", count: 48 },
    { id: "result-option-2", content: "단계적으로 시행", count: 36 },
    { id: "result-option-3", content: "현행 유지", count: 28 },
    { id: "result-option-4", content: "추가 검토", count: 16 },
  ],
});
