// 화면 배치가 소수점 px로 계산돼 맨 아래 메시지가 목록 끝에 딱 맞아도 1px 미만 넘칠 수 있음
// 그 정도는 화면 안에 있는 것으로 봄
const BOTTOM_EDGE_TOLERANCE_PX = 1;

export function findChatMessageViewportReadThroughSequence(
  scrollElement: HTMLElement,
): number | null {
  const viewportBottom = scrollElement.getBoundingClientRect().bottom + BOTTOM_EDGE_TOLERANCE_PX;
  let readThroughSequence: number | null = null;

  // 메시지 본문의 마지막 줄이 화면에 보이거나 이미 위로 지나갔으면 읽은 것으로 봄
  // 그런 메시지 중 가장 아래 메시지의 순번을 읽은 위치로 씀
  for (const messageElement of scrollElement.querySelectorAll<HTMLElement>(
    "[data-room-sequence]",
  )) {
    const roomSequence = Number(messageElement.dataset.roomSequence);
    const bodyElement =
      messageElement.querySelector<HTMLElement>("[data-message-bubble]") ?? messageElement;

    if (
      Number.isSafeInteger(roomSequence) &&
      bodyElement.getBoundingClientRect().bottom <= viewportBottom &&
      (readThroughSequence === null || roomSequence > readThroughSequence)
    ) {
      readThroughSequence = roomSequence;
    }
  }

  return readThroughSequence;
}
