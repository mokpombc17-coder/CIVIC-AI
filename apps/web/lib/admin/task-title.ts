// 투표 제목은 공백 포함 20자까지 입력받고, 모바일 목록·카드에서 잘리지 않는 길이는 16자다.
export const TASK_TITLE_MAX_LENGTH = 20;
export const TASK_TITLE_MOBILE_SAFE_LENGTH = 16;

export function taskTitleLength(title: string): number {
  return title.trim().length;
}

export function taskTitleTooLongMessage(title: string): string | null {
  return taskTitleLength(title) > TASK_TITLE_MAX_LENGTH
    ? `투표 제목은 공백 포함 ${TASK_TITLE_MAX_LENGTH}자 이내로 입력해 주세요.`
    : null;
}

export function taskTitleMobileWarning(title: string): string | null {
  const length = taskTitleLength(title);
  return length > TASK_TITLE_MOBILE_SAFE_LENGTH
    ? `제목이 ${TASK_TITLE_MOBILE_SAFE_LENGTH}자를 넘으면 모바일에서 잘려 보일 수 있습니다. (현재 ${length}/${TASK_TITLE_MAX_LENGTH}자)`
    : null;
}
