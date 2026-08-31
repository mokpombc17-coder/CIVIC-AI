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

export function sortOpenTasksByLatest(tasks: readonly UserTaskSummary[]): UserTaskSummary[] {
  return sortTasksByTimestamp(tasks, (task) => task.openedAt);
}

export function sortCompletedTasksByLatest(
  tasks: readonly CompletedTaskSummary[],
): CompletedTaskSummary[] {
  return sortTasksByTimestamp(tasks, (task) => task.closedAt);
}

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

function sortTasksByTimestamp<T extends { taskId: string }>(
  tasks: readonly T[],
  getTimestamp: (task: T) => string,
): T[] {
  return [...tasks].sort((left, right) => {
    const timestampOrder = Date.parse(getTimestamp(right)) - Date.parse(getTimestamp(left));
    if (Number.isFinite(timestampOrder) && timestampOrder !== 0) return timestampOrder;
    return left.taskId.localeCompare(right.taskId);
  });
}
