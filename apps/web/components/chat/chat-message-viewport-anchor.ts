export type ChatMessageViewportAnchor = Readonly<{
  offsetFromViewportTop: number;
  renderKey: string;
  viewportKey: string;
}>;

export function captureChatMessageViewportAnchor(
  scrollElement: HTMLDivElement,
): ChatMessageViewportAnchor | null {
  const viewportBounds = scrollElement.getBoundingClientRect();
  // 날짜 구분선은 바로 뒤 항목에 따라 render key가 바뀌어 과거 메시지가 앞에 붙으면 다시 찾을 수 없으므로 기준에서 제외함
  const renderedItems = [
    ...scrollElement.querySelectorAll<HTMLLIElement>("[data-render-key]:not([data-date-key])"),
  ];
  const firstVisibleItem = renderedItems
    .filter((item) => item.getBoundingClientRect().bottom > viewportBounds.top)
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
  const renderKey = firstVisibleItem?.dataset.renderKey;

  if (!firstVisibleItem || !renderKey) {
    return null;
  }

  return {
    offsetFromViewportTop: firstVisibleItem.getBoundingClientRect().top - viewportBounds.top,
    renderKey,
    viewportKey: currentViewportKeyFromElement(scrollElement),
  };
}

export function findRenderedChatMessageAnchorElement(
  scrollElement: HTMLDivElement,
  renderKey: string,
): HTMLLIElement | null {
  return (
    [...scrollElement.querySelectorAll<HTMLLIElement>("[data-render-key]")].find(
      (item) => item.dataset.renderKey === renderKey,
    ) ?? null
  );
}

function currentViewportKeyFromElement(scrollElement: HTMLDivElement): string {
  return scrollElement.dataset.viewportKey ?? "";
}
