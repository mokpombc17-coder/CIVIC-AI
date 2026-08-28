import type { RoomCategorySummary } from "@/lib/chat/chat-room-contracts";

export function ChatRoomCategoryBadges({
  categories,
  maxVisible = 1,
}: Readonly<{
  categories: readonly RoomCategorySummary[];
  maxVisible?: number;
}>) {
  const sortedCategories = [...categories].sort((left, right) =>
    left.name.localeCompare(right.name, "ko-KR"),
  );
  const visibleCategories = sortedCategories.slice(0, Math.max(1, maxVisible));
  const hiddenCount = sortedCategories.length - visibleCategories.length;

  return (
    <span
      aria-label={`카테고리: ${sortedCategories.map(({ name }) => name).join(", ")}`}
      className="flex min-w-0 items-center gap-1"
    >
      {visibleCategories.map((category) => (
        <span
          aria-hidden="true"
          className="max-w-28 truncate rounded-full bg-[var(--chat-publishing-color-accent-soft)] px-2 py-0.5 text-xs font-bold leading-4 text-[var(--chat-publishing-color-primary-emphasis)]"
          key={category.categoryId}
        >
          {category.name}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span
          aria-hidden="true"
          className="shrink-0 text-xs font-medium text-[var(--chat-publishing-color-muted)]"
        >
          외 {hiddenCount}
        </span>
      ) : null}
    </span>
  );
}
