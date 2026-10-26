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
  // 스크롤 위치가 정해질 때마다 호출되므로 항목마다 위치를 한 번만 읽고 그중 가장 위 항목을 고름
  let firstVisibleItem: HTMLLIElement | null = null;
  let firstVisibleTop = Number.POSITIVE_INFINITY;

  for (const item of scrollElement.querySelectorAll<HTMLLIElement>(
    "[data-render-key]:not([data-date-key])",
  )) {
    const bounds = item.getBoundingClientRect();

    if (bounds.bottom > viewportBounds.top && bounds.top < firstVisibleTop) {
      firstVisibleItem = item;
      firstVisibleTop = bounds.top;
    }
  }

  const renderKey = firstVisibleItem?.dataset.renderKey;

  if (!firstVisibleItem || !renderKey) {
    return null;
  }

  return {
    offsetFromViewportTop: firstVisibleTop - viewportBounds.top,
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
