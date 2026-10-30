const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

export function isChatMessageViewportScrollKey(key: string, target: EventTarget | null): boolean {
  if (!SCROLL_KEYS.has(key)) {
    return false;
  }

  if (!(target instanceof HTMLElement)) {
    return true;
  }

  // 입력 요소 안의 키는 글자 입력과 커서 이동이라 스크롤로 보지 않음
  if (
    target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !==
    null
  ) {
    return false;
  }

  // 버튼에 focus가 있으면 Space는 버튼을 누르는 키라 스크롤로 보지 않음
  return key !== " " || target.closest("button, a[href], [role='button']") === null;
}
