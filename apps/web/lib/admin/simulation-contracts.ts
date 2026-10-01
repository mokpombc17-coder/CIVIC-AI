import { z } from "zod";
import { readTaskSummaries, type TaskSummary } from "./domain-contracts";

const canonicalUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);

export const simulationStates = [
  "READY",
  "RUNNING",
  "WAITING_PROVIDER",
  "COMPLETED",
  "FAILED",
  "FAILED_PROVIDER",
  "REVIEW_REQUIRED",
  "PUBLISHING",
  "REJECTED_PROVIDER_POLICY",
  "CANCELLED",
] as const;
export type SimulationState = (typeof simulationStates)[number];

const simulationViewSchema = z
  .object({
    simulationId: z.string().uuid(),
    taskId: canonicalUuidSchema,
    state: z.enum(simulationStates),
    personaCount: z.number().int().positive(),
    progressPercent: z.number().int().min(0).max(100),
    cancelRequested: z.boolean(),
    errorCode: z.string().nullable(),
    resumeAt: z.string().min(1).nullable(),
    retryAvailableAt: z.string().min(1).nullable(),
    waitReason: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    startedAt: z.string().min(1).nullable(),
    completedAt: z.string().min(1).nullable(),
    deadlineAt: z.string().min(1),
    estimatedCompletionAt: z.string().min(1).nullable(),
    canCancel: z.boolean(),
    estimatedKrw: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    holdKrw: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    settledKrw: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    absorbedKrw: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    billingState: z.enum(["UNBILLED", "HELD", "SETTLED", "RELEASED"]).optional(),
  })
  .strict();

const filterOptionsSchema = z
  .object({
    genders: z.array(z.string().min(1)),
    ageGroups: z.array(z.string().min(1)),
    regions: z.array(z.string().min(1)),
    politicalIdeologies: z.array(z.string().min(1)),
  })
  .strict();

const simulationOptionsSchema = z
  .object({
    minPersonaCount: z.number().int().positive(),
    maxPersonaCount: z.number().int().positive(),
    defaultModel: z.string().min(1),
    models: z.array(z.string().min(1)).min(1),
    filters: filterOptionsSchema,
  })
  .strict()
  .refine((value) => value.minPersonaCount <= value.maxPersonaCount, {
    message: "minPersonaCount must not exceed maxPersonaCount",
  })
  .refine((value) => value.models.includes(value.defaultModel), {
    message: "defaultModel must be included in models",
  });

const simulationCapacitySchema = z
  .object({
    minPersonaCount: z.number().int().positive(),
    maxPersonaCount: z.number().int().positive(),
    availablePersonaCount: z.number().int().nonnegative(),
    requestedPersonaCount: z.number().int().positive(),
    canSimulate: z.boolean(),
    blockReason: z
      .enum([
        "PERSONA_COUNT_BELOW_MINIMUM",
        "PERSONA_COUNT_ABOVE_MAXIMUM",
        "INSUFFICIENT_UNIQUE_CAPACITY",
      ])
      .nullable(),
  })
  .strict()
  .refine((value) => value.minPersonaCount <= value.maxPersonaCount, {
    message: "minPersonaCount must not exceed maxPersonaCount",
  })
  .refine((value) => value.canSimulate === (value.blockReason === null), {
    message: "canSimulate and blockReason must agree",
  });

const taskOptionSchema = z
  .object({
    id: canonicalUuidSchema,
    displayOrder: z.number().int(),
    content: z.string().min(1),
  })
  .strict();

const simulationResultOptionSchema = z
  .object({
    optionId: canonicalUuidSchema,
    displayOrder: z.number().int(),
    content: z.string().min(1),
    count: z.number().int().nonnegative(),
    percentage: z.number().min(0).max(100),
  })
  .strict();

const simulationResultSchema = z
  .object({
    schemaVersion: z.literal("CIVIC_TASK_SIMULATION_RESULT_VIEW_V2"),
    notice: z.literal("이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다."),
    task: z
      .object({
        id: canonicalUuidSchema,
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        status: z.string().min(1).optional(),
        question: z
          .object({
            id: canonicalUuidSchema,
            content: z.string().min(1),
            description: z.string().nullable().optional(),
            options: z.array(taskOptionSchema).min(2),
          })
          .strict(),
      })
      .strict(),
    run: z
      .object({
        personaCount: z.number().int().positive(),
        modelType: z.string().min(1),
        filters: z
          .object({
            genders: z.array(z.string().min(1)).optional(),
            age_groups: z.array(z.string().min(1)).optional(),
          })
          .strict(),
      })
      .strict(),
    denominators: z
      .object({
        total: z.number().int().nonnegative(),
        filtered: z.number().int().nonnegative(),
      })
      .strict(),
    optionResults: z.array(simulationResultOptionSchema),
    unansweredCount: z.number().int().nonnegative(),
    summary: z
      .object({
        totalRespondentCount: z.number().int().nonnegative(),
        filteredRespondentCount: z.number().int().nonnegative(),
        answeredPersonaCount: z.number().int().nonnegative(),
        unansweredPersonaCount: z.number().int().nonnegative(),
        optionResults: z.array(simulationResultOptionSchema),
      })
      .strict(),
    availableFilters: z
      .object({
        genders: z.array(z.string().min(1)),
        ageGroups: z.array(z.string().min(1)),
      })
      .strict(),
    resultSlots: z.array(z.number().int().positive()),
  })
  .strict();

const simulationResultDetailSchema = z
  .object({
    schemaVersion: z.literal("CIVIC_TASK_SIMULATION_SLOT_DETAIL_V1"),
    notice: z.literal("이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다."),
    resultSlot: z.number().int().positive(),
    selectedOptionId: canonicalUuidSchema.nullable(),
    reason: z.string().nullable(),
    demographics: z
      .object({
        gender: z.string().nullable(),
        ageGroup: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type SimulationView = z.infer<typeof simulationViewSchema>;
export type SimulationTaskSummary = TaskSummary &
  Readonly<{ latestSimulation: SimulationView | null }>;
export type SimulationOptions = z.infer<typeof simulationOptionsSchema>;
export type SimulationCapacity = z.infer<typeof simulationCapacitySchema>;
export type SimulationResult = z.infer<typeof simulationResultSchema>;
export type SimulationResultDetail = z.infer<typeof simulationResultDetailSchema>;

export function readSimulationView(value: unknown): SimulationView | null {
  const parsed = simulationViewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationViews(value: unknown): readonly SimulationView[] | null {
  const parsed = z.array(simulationViewSchema).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationTaskSummaries(
  value: unknown,
): readonly SimulationTaskSummary[] | null {
  const tasks = readTaskSummaries(value);
  if (!tasks || !Array.isArray(value)) return null;
  const parsed = z
    .array(z.object({ latestSimulation: simulationViewSchema.nullable() }).passthrough())
    .safeParse(value);
  if (!parsed.success) return null;
  return tasks.map((task, index) => ({
    ...task,
    latestSimulation: parsed.data[index]?.latestSimulation ?? null,
  }));
}

export type SimulationTargetPresentation = Readonly<{
  action: "설정하기" | "진행 보기" | "결과 보기" | "상태 확인";
  label: "준비됨" | "진행 중" | "완료" | "확인 필요";
  target: "setup" | "status" | "results";
  tone: "ready" | "running" | "completed" | "attention";
}>;

const activeSimulationStates = new Set<SimulationState>([
  "READY",
  "RUNNING",
  "WAITING_PROVIDER",
  "PUBLISHING",
]);

export function simulationTargetPresentation(
  state: SimulationState | null,
): SimulationTargetPresentation {
  if (state === null) {
    return { label: "준비됨", action: "설정하기", target: "setup", tone: "ready" };
  }
  if (state === "COMPLETED") {
    return { label: "완료", action: "결과 보기", target: "results", tone: "completed" };
  }
  if (activeSimulationStates.has(state)) {
    return { label: "진행 중", action: "진행 보기", target: "status", tone: "running" };
  }
  return { label: "확인 필요", action: "상태 확인", target: "status", tone: "attention" };
}

export function simulationTargetHref(
  taskId: string,
  latest: Pick<SimulationView, "simulationId" | "state"> | null,
): string {
  const presentation = simulationTargetPresentation(latest?.state ?? null);
  if (!latest || presentation.target === "setup") {
    return `/admin/simulations/setup?taskId=${encodeURIComponent(taskId)}`;
  }
  return `/admin/simulations/${presentation.target}?simulationId=${encodeURIComponent(latest.simulationId)}`;
}

export function readSimulationOptions(value: unknown): SimulationOptions | null {
  const parsed = simulationOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationCapacity(value: unknown): SimulationCapacity | null {
  const parsed = simulationCapacitySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationResult(value: unknown): SimulationResult | null {
  const parsed = simulationResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationResultDetail(value: unknown): SimulationResultDetail | null {
  const parsed = simulationResultDetailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isPersonaCountWithinLimit(
  personaCount: number,
  minPersonaCount: number,
  maxPersonaCount: number,
): boolean {
  return (
    Number.isSafeInteger(personaCount) &&
    Number.isSafeInteger(minPersonaCount) &&
    minPersonaCount > 0 &&
    Number.isSafeInteger(maxPersonaCount) &&
    maxPersonaCount >= minPersonaCount &&
    personaCount >= minPersonaCount &&
    personaCount <= maxPersonaCount
  );
}

const scenarioQuestionSchema = z
  .object({
    id: canonicalUuidSchema,
    content: z.string().min(1),
    description: z.string().nullable(),
    options: z.array(taskOptionSchema).min(2).max(10),
  })
  .strict();

const simulationScenarioSchema = z
  .object({
    scenarioId: canonicalUuidSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    question: scenarioQuestionSchema,
    sourceTaskId: canonicalUuidSchema.nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    latestSimulation: simulationViewSchema.nullable(),
  })
  .strict();

export type SimulationScenario = z.infer<typeof simulationScenarioSchema>;

export function readSimulationScenario(value: unknown): SimulationScenario | null {
  const parsed = simulationScenarioSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readSimulationScenarios(value: unknown): readonly SimulationScenario[] | null {
  const parsed = z.array(simulationScenarioSchema).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type SimulationScenarioDraft = Readonly<{
  title: string;
  description: string | null;
  question: Readonly<{
    content: string;
    description: string | null;
    options: readonly Readonly<{ content: string }>[];
  }>;
  sourceTaskId: string | null;
}>;

export function validateSimulationScenarioDraft(draft: SimulationScenarioDraft): string | null {
  if (!draft.title.trim()) return "시뮬레이션 제목을 입력해 주세요.";
  if (draft.title.trim().length > 200) return "시뮬레이션 제목은 200자 이하로 입력해 주세요.";
  if (!draft.question.content.trim()) return "질문을 입력해 주세요.";
  const options = draft.question.options;
  if (options.length < 2 || options.length > 10) return "선택지는 2~10개로 입력해 주세요.";
  const normalized = options.map((option) => option.content.trim().replace(/\s+/gu, " "));
  if (normalized.some((option) => !option)) return "모든 선택지 내용을 입력해 주세요.";
  if (new Set(normalized).size !== normalized.length)
    return "같은 내용의 선택지는 중복해서 사용할 수 없습니다.";
  return null;
}

export const UNANSWERED_OPTION_FILTER = "UNANSWERED";

const simulationResponseItemSchema = z
  .object({
    resultSlot: z.number().int().positive(),
    selectedOptionId: canonicalUuidSchema.nullable(),
    reason: z.string().nullable(),
    demographics: z
      .object({
        gender: z.string().nullable(),
        ageGroup: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

const simulationResponsePageSchema = z
  .object({
    schemaVersion: z.literal("CIVIC_TASK_SIMULATION_RESPONSE_PAGE_V1"),
    notice: z.literal("이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다."),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    items: z.array(simulationResponseItemSchema),
  })
  .strict();

export type SimulationResponsePage = z.infer<typeof simulationResponsePageSchema>;

export function readSimulationResponsePage(value: unknown): SimulationResponsePage | null {
  const parsed = simulationResponsePageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type VoteSimulationComparisonRow = Readonly<{
  optionId: string;
  content: string;
  voteCount: number;
  voteRate: number;
  simulationCount: number;
  simulationRate: number;
  // 시뮬레이션 비율 - 실제 투표 비율 (%p)
  differencePoints: number;
}>;

// 실제 투표와 시뮬레이션은 같은 투표 스냅샷의 선택지 ID로 맞춘다.
export function buildVoteSimulationComparison(
  vote: Readonly<{
    responseCount: number;
    options: readonly Readonly<{ key: string; content: string; count: number; rate: number }>[];
  }>,
  simulation: Pick<SimulationResult, "optionResults">,
): readonly VoteSimulationComparisonRow[] {
  return vote.options.map((option) => {
    const simulated = simulation.optionResults.find((item) => item.optionId === option.key);
    const voteRate = option.rate * 100;
    const simulationRate = simulated?.percentage ?? 0;
    return {
      optionId: option.key,
      content: option.content,
      voteCount: option.count,
      voteRate,
      simulationCount: simulated?.count ?? 0,
      simulationRate,
      differencePoints: simulationRate - voteRate,
    };
  });
}

export function latestCompletedSimulations(
  views: readonly SimulationView[],
): readonly SimulationView[] {
  return views
    .filter((view) => view.state === "COMPLETED")
    .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
