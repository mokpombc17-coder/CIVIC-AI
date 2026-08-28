import type { CompletedTaskSummary } from "./vote-completed-contracts";
import type { UserTaskSummary } from "./vote-task-contracts";
import { formatVoteDateTime } from "./vote-format";

export type VoteTaskListItemPresentation = Readonly<{
  taskId: string;
  statusLabel: "진행 중" | "참여 완료" | "완료";
  title: string;
  supportingText: string;
  actionLabel: "참여하기" | "응답 보기" | "결과보기";
  actionHref: `/vote/${string}`;
  sourceLabel?: "디자인 샘플" | "실제 API";
}>;

export function presentOpenTask(task: UserTaskSummary): VoteTaskListItemPresentation {
  if (task.submission.submitted) {
    return {
      taskId: task.taskId,
      statusLabel: "참여 완료",
      title: task.title,
      supportingText: `${formatVoteDateTime(task.closesAt)} 마감`,
      actionLabel: "응답 보기",
      actionHref: `/vote/${task.taskId}`,
    };
  }

  return {
    taskId: task.taskId,
    statusLabel: "진행 중",
    title: task.title,
    supportingText: `${formatVoteDateTime(task.closesAt)} 마감`,
    actionLabel: "참여하기",
    actionHref: `/vote/${task.taskId}`,
  };
}

export function presentCompletedTask(task: CompletedTaskSummary): VoteTaskListItemPresentation {
  return {
    taskId: task.taskId,
    statusLabel: "완료",
    title: task.title,
    supportingText: `${formatVoteDateTime(task.closedAt)} 마감`,
    actionLabel: "결과보기",
    actionHref: `/vote/${task.taskId}/result`,
    sourceLabel: "실제 API",
  };
}
