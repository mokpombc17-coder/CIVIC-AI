import type { UserTaskSummary } from "./vote-task-contracts";
import { formatVoteDateTime } from "./vote-format";

export type VoteTaskListItemPresentation = Readonly<{
  taskId: string;
  statusLabel: "진행 중" | "참여 완료" | "완료";
  title: string;
  supportingText: string;
  actionLabel: "참여하기" | "응답 보기" | "결과보기";
  actionHref: `/vote/${string}`;
}>;

export function presentOpenTask(task: UserTaskSummary): VoteTaskListItemPresentation {
  if (task.submission.submitted) {
    return {
      taskId: task.taskId,
      statusLabel: "참여 완료",
      title: task.title,
      supportingText: `${formatVoteDateTime(task.submission.submittedAt)} 참여 완료`,
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
