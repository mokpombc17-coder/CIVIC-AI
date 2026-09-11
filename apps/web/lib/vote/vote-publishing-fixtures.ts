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
    title: "울산 도시철도1호선(트램)",
    supportingText: "결과 확인 가능",
    actionLabel: "결과보기",
    actionHref: `/vote/${PUBLISHING_COMPLETED_TASK_ID}/result?source=mock`,
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
  title:
    "울산 도시철도1호선(트램)\n트램 발주계약의 공정성 및 적정성 관련 이슈: 실시계획 확정 및 환경영향평가가 이루어지지 않은 가운데 발주계약이 체결된 행정 절차상 문제점과, 약정상 중단 기한(60일) 제한 등의 문제가 존재하여  합법적 사업 중단/재검토 방안 모색하고 있음.",
  question: "울산도시철도 1호선 사업을 원안대로 진행해야 한다에 동의하십니까?",
  responseCount: 100,
  options: [
    { id: "result-option-1", content: "동의한다", count: 7 },
    { id: "result-option-2", content: "동의하지 않는다", count: 60 },
    { id: "result-option-3", content: "잘모르겠다", count: 33 },
  ],
  mySubmission: {
    respondentNumber: 1,
    selectedOptionId: "result-option-2",
    finalReason:
      "울산 트램 사업은 환경영향평가나 실시계획 승인 같은 핵심 행정절차가 완료되기도 전에 본계약이 먼저 체결된 게 문제라고 생각해. 재정 타당성도 제대로 검증되지 않은 상태에서 원안대로 밀어붙이면 나중에 더 큰 갈등과 비용이 생길 수 있어서, 절차를 제대로 밟고 재검토하는 게 맞다고 봐.",
  },
  qualitativeSummary: {
    sameChoice:
      "실시계획이나 환경영향평가가 끝나기 전에 계약이 체결된 점을 행정 절차의 문제로 보고, 재정 타당성이나 환경 영향이 충분히 검증되지 않은 상태에서 원안 추진을 이어가는 데 반대했습니다. 그대로 추진하면 재정 낭비·갈등·법적 분쟁 같은 더 큰 문제가 생길 수 있다는 우려와 함께, 재검증과 정보 공개 또는 주민 의견 수렴을 거친 뒤 사업 방향을 판단해야 한다는 요구도 제시됐습니다.",
    differentChoices:
      "‘동의한다’를 고른 응답에서는 교통 인프라 개선을 기대하고, 이미 진행된 사업을 중단할 때 발생할 비용 손실과 혼란을 피하기 위해 원안대로 추진하자는 이유가 제시됐습니다. ‘잘모르겠다’를 고른 응답에서는 절차상 우려를 느끼면서도 사업의 필요성을 인정하거나 사업 자체를 반대하지 않아 판단을 유보했으며, 먼저 절차와 관련 정보를 검증해야 한다는 요구도 있었습니다.",
  },
});
