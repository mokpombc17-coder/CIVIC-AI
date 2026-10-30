import type { CompletedTaskSummary } from "./vote-completed-contracts";
import type { UserTaskSummary } from "./vote-task-contracts";
import type { SearchTaskItem } from "./vote-task-search-contracts";
import { formatVoteDateTime } from "./vote-format";

export type VoteTaskListItemPresentation = Readonly<{
  taskId: string;
  statusLabel: "진행 중" | "참여 완료" | "완료";
  title: string;
  supportingText: string;
  actionLabel: "참여하기" | "응답 보기" | "결과보기" | "결과 준비 중";
  actionHref: `/vote/${string}` | null;
  sourceLabel?: "디자인 샘플";
}>;

export function sortOpenTasksUnsubmittedFirst(
  tasks: readonly UserTaskSummary[],
): UserTaskSummary[] {
  // 진행 중 목록에서 아직 참여할 투표가 참여 완료 투표 아래로 밀리지 않도록 미참여 묶음을 먼저 두고, 각 묶음 안은 기존처럼 최신순 유지
  const latestFirst = sortTasksByTimestamp(tasks, (task) => task.openedAt);
  return [
    ...latestFirst.filter((task) => !task.submission.submitted),
    ...latestFirst.filter((task) => task.submission.submitted),
  ];
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
  };
}

export function presentSearchTask(task: SearchTaskItem): VoteTaskListItemPresentation {
  if (task.taskStatus === "OPEN") {
    return {
      taskId: task.taskId,
      statusLabel: task.mySubmission ? "참여 완료" : "진행 중",
      title: task.title,
      supportingText: `${formatVoteDateTime(task.closesAt)} 마감`,
      actionLabel: task.mySubmission ? "응답 보기" : "참여하기",
      actionHref: `/vote/${task.taskId}`,
    };
  }

  return {
    taskId: task.taskId,
    statusLabel: "완료",
    title: task.title,
    supportingText: `${formatVoteDateTime(task.closedAt)} 마감`,
    actionLabel: task.resultAvailable ? "결과보기" : "결과 준비 중",
    actionHref: task.resultAvailable ? `/vote/${task.taskId}/result` : null,
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
