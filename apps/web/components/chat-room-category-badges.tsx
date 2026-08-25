import { getChatRoomCategoryLabel } from "@/components/chat-room-category";
import type { RoomCategories } from "@/lib/chat/chat-room-contracts";

type ChatRoomCategoryBadgesProps = Readonly<{
  categories: RoomCategories;
  className?: string;
}>;

export function ChatRoomCategoryBadges({ categories, className }: ChatRoomCategoryBadgesProps) {
  return (
    <span
      aria-label="방 카테고리"
      className={["flex min-w-0 flex-wrap items-center gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      {categories.map((category) => (
        <span
          className="max-w-full truncate rounded-[4px] bg-[#edf2ff] px-1.5 py-0.5 text-xs font-bold leading-[18px] text-[#0a4fd1]"
          key={category}
        >
          {getChatRoomCategoryLabel(category)}
        </span>
      ))}
    </span>
  );
}
