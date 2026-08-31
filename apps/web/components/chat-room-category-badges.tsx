import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RoomCategorySummary } from "@/lib/chat/chat-room-contracts";

const CATEGORY_GAP_PX = 4;
const CATEGORY_BADGE_CLASS_NAME =
  "max-w-28 truncate rounded-[4px] bg-[var(--chat-publishing-color-accent-soft)] px-1.5 py-0.5 text-xs font-bold leading-[18px] text-[var(--chat-publishing-color-primary-emphasis)]";
const HIDDEN_COUNT_CLASS_NAME =
  "shrink-0 text-xs font-medium text-[var(--chat-publishing-color-muted)]";

export function ChatRoomCategoryBadges({
  categories,
  fitAvailableWidth = false,
  maxVisible = 1,
}: Readonly<{
  categories: readonly RoomCategorySummary[];
  fitAvailableWidth?: boolean;
  maxVisible?: number;
}>) {
  const sortedCategories = useMemo(
    () => [...categories].sort((left, right) => left.name.localeCompare(right.name, "ko-KR")),
    [categories],
  );
  const containerRef = useRef<HTMLSpanElement>(null);
  const [fittingCount, setFittingCount] = useState(1);

  useLayoutEffect(() => {
    if (!fitAvailableWidth) return;

    const container = containerRef.current;
    if (!container) return;

    const updateFittingCount = () => {
      const categoryWidths = [
        ...container.querySelectorAll<HTMLElement>("[data-category-measure]"),
      ].map((element) => element.offsetWidth);
      const hiddenCountWidths = new Map(
        [...container.querySelectorAll<HTMLElement>("[data-hidden-count-measure]")].map(
          (element) => [Number(element.dataset.hiddenCountMeasure), element.offsetWidth] as const,
        ),
      );
      const nextCount = getFittingCategoryCount({
        availableWidth: container.clientWidth,
        categoryWidths,
        gap: CATEGORY_GAP_PX,
        hiddenCountWidths,
      });

      setFittingCount((currentCount) => (currentCount === nextCount ? currentCount : nextCount));
    };

    updateFittingCount();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateFittingCount);
    resizeObserver?.observe(container);
    window.addEventListener("resize", updateFittingCount);
    void document.fonts?.ready.then(updateFittingCount);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateFittingCount);
    };
  }, [fitAvailableWidth, sortedCategories]);

  const visibleCount = Math.min(
    sortedCategories.length,
    fitAvailableWidth ? fittingCount : Math.max(1, maxVisible),
  );
  const visibleCategories = sortedCategories.slice(0, visibleCount);
  const hiddenCount = sortedCategories.length - visibleCategories.length;
  const forceFirstCategoryToFit = fitAvailableWidth && visibleCount === 1 && hiddenCount > 0;

  return (
    <span
      aria-label={`카테고리: ${sortedCategories.map(({ name }) => name).join(", ")}`}
      className="relative flex min-w-0 items-center gap-1 overflow-hidden"
      data-fit-available-width={fitAvailableWidth ? "true" : undefined}
      ref={containerRef}
    >
      {visibleCategories.map((category) => (
        <span
          aria-hidden="true"
          className={`${CATEGORY_BADGE_CLASS_NAME} ${
            forceFirstCategoryToFit ? "min-w-0 flex-1" : "shrink-0"
          }`}
          key={category.categoryId}
        >
          {category.name}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span aria-hidden="true" className={HIDDEN_COUNT_CLASS_NAME}>
          외 {hiddenCount}
        </span>
      ) : null}
      {fitAvailableWidth ? (
        <span
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1"
        >
          {sortedCategories.map((category) => (
            <span
              className={`${CATEGORY_BADGE_CLASS_NAME} shrink-0`}
              data-category-measure="true"
              key={category.categoryId}
            >
              {category.name}
            </span>
          ))}
          {sortedCategories.slice(1).map((_category, index) => {
            const measuredHiddenCount = index + 1;

            return (
              <span
                className={HIDDEN_COUNT_CLASS_NAME}
                data-hidden-count-measure={measuredHiddenCount}
                key={measuredHiddenCount}
              >
                외 {measuredHiddenCount}
              </span>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

export function getFittingCategoryCount({
  availableWidth,
  categoryWidths,
  gap,
  hiddenCountWidths,
}: Readonly<{
  availableWidth: number;
  categoryWidths: readonly number[];
  gap: number;
  hiddenCountWidths: ReadonlyMap<number, number>;
}>): number {
  if (categoryWidths.length === 0) return 0;

  for (let visibleCount = categoryWidths.length; visibleCount >= 1; visibleCount -= 1) {
    const hiddenCount = categoryWidths.length - visibleCount;
    const categoriesWidth = categoryWidths
      .slice(0, visibleCount)
      .reduce((total, width) => total + width, 0);
    const categoryGapCount = Math.max(0, visibleCount - 1);
    const hiddenCountWidth = hiddenCount === 0 ? 0 : (hiddenCountWidths.get(hiddenCount) ?? 0);
    const counterGapCount = hiddenCount === 0 ? 0 : 1;
    const requiredWidth =
      categoriesWidth + hiddenCountWidth + (categoryGapCount + counterGapCount) * Math.max(0, gap);

    if (requiredWidth <= Math.max(0, availableWidth)) return visibleCount;
  }

  return 1;
}
