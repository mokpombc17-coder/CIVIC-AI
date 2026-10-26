import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserTaskDetail } from "@/lib/vote/vote-task-contracts";
import { useVoteTaskController } from "./use-vote-task-controller";
import { VoteTaskScreen } from "./vote-task-screen";

const useVoteTaskControllerMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/platform-navigation-client", () => ({
  PlatformNavigationClient: () => null,
}));

vi.mock("./use-vote-task-controller", () => ({
  useVoteTaskController: useVoteTaskControllerMock,
}));

describe("VoteTaskScreen", () => {
  beforeEach(() => {
    useVoteTaskControllerMock.mockReset();
    useVoteTaskControllerMock.mockReturnValue(createController());
  });

  it("과업 조회 중에는 전용 로딩 화면을 유지한다", () => {
    useVoteTaskControllerMock.mockReturnValue(createController({ model: { taskIsPending: true } }));

    const html = renderToStaticMarkup(<VoteTaskScreen taskId="task-a" />);

    expect(useVoteTaskControllerMock).toHaveBeenCalledWith("task-a");
    expect(html).toContain('data-vote-task-screen-loading="true"');
  });

  it("과업 조회 실패는 기존 오류 안내와 재시도 action을 표시한다", () => {
    useVoteTaskControllerMock.mockReturnValue(
      createController({
        model: {
          taskError: new Error("network failed"),
          taskIsError: true,
        },
      }),
    );

    const html = renderToStaticMarkup(<VoteTaskScreen taskId="task-a" />);

    expect(html).toContain("과업을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(html).toContain(">다시 시도</button>");
  });

  it("AI 예상 답변 준비가 실패하면 안내와 함께 다시 시도 버튼을 표시한다", () => {
    useVoteTaskControllerMock.mockReturnValue(
      createController({
        model: {
          canRetryPreparation: true,
          preparationMessage: "AI 예상 답변을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          predictionFailed: true,
          showParticipationAction: true,
          step: 1,
          taskDetail: createTaskDetail(),
        },
      }),
    );

    const html = renderToStaticMarkup(<VoteTaskScreen taskId="task-a" />);

    expect(html).toContain("AI 예상 답변을 준비하지 못했습니다.");
    expect(html).toContain(">다시 시도</button>");
  });

  it("작성 단계에서는 controller의 선택지와 입력 상태를 조립한다", () => {
    const taskDetail = createTaskDetail();
    useVoteTaskControllerMock.mockReturnValue(
      createController({
        model: {
          directReasonAllowed: true,
          options: taskDetail.task.question.options,
          step: 2,
          taskDetail,
        },
      }),
    );

    const html = renderToStaticMarkup(<VoteTaskScreen taskId="task-a" />);

    expect(html).toContain("응답 작성");
    expect(html).toContain("대중교통 확대");
    expect(html).toContain("직접 작성");
  });
});

type VoteTaskController = ReturnType<typeof useVoteTaskController>;

function createController({
  actions: actionPatch = {},
  model: modelPatch = {},
}: {
  actions?: Partial<VoteTaskController["actions"]>;
  model?: Partial<VoteTaskController["model"]>;
} = {}): VoteTaskController {
  return {
    actions: {
      changeDirectReason: vi.fn(),
      chooseOption: vi.fn(),
      chooseReason: vi.fn(),
      closeCancel: vi.fn(),
      discardPendingSubmission: vi.fn(),
      goToStep: vi.fn(),
      moveToConfirmation: vi.fn(),
      openCancel: vi.fn(),
      retryPendingSubmission: vi.fn(),
      retryPredictionPreparation: vi.fn(),
      retrySubmissionView: vi.fn(),
      retryTaskLoad: vi.fn(),
      submitResponse: vi.fn(),
      ...actionPatch,
    },
    model: {
      cancelOpen: false,
      canRetryPreparation: false,
      confirmationReason: "",
      directReason: "",
      directReasonAllowed: false,
      directReasonError: null,
      directReasonLength: 0,
      isRecoveringSubmission: false,
      isSubmitting: false,
      isViewingSubmittedResponse: false,
      options: [],
      participationReady: false,
      predictedReasons: [],
      predictionFailed: false,
      predictionPreparationLoading: false,
      predictionView: undefined,
      preparationMessage: null,
      reasonChoice: null,
      reasonReady: false,
      recoverableSubmission: null,
      selectedOption: undefined,
      selectedOptionId: null,
      showParticipationAction: false,
      showSubmissionLoading: false,
      step: 1,
      submissionError: null,
      taskDetail: undefined,
      taskError: null,
      taskIsError: false,
      taskIsPending: false,
      taskSubmission: undefined,
      taskSubmissionError: null,
      taskSubmissionIsError: false,
      ...modelPatch,
    },
  };
}

function createTaskDetail(): UserTaskDetail {
  return {
    task: {
      id: "13000000-0000-0000-0000-000000000003",
      title: "교통 정책 투표",
      description: "지역 교통 개선 방향을 선택해 주세요.",
      question: {
        id: "13010001-0000-0000-0000-000000000001",
        content: "어떤 정책을 우선해야 할까요?",
        description: null,
        options: [
          {
            id: "13020002-0000-0000-0000-000000000001",
            displayOrder: 1,
            content: "대중교통 확대",
          },
        ],
      },
      status: "OPEN",
      schedule: null,
      publishedAt: "2026-10-01T00:00:00Z",
      openedAt: "2026-10-01T00:00:00Z",
      closedAt: null,
      closureType: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
    closesAt: "2026-10-31T00:00:00Z",
    submission: {
      submitted: false,
      submissionId: null,
      submittedAt: null,
    },
  };
}
