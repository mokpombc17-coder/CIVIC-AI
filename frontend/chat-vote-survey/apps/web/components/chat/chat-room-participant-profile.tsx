import type { ReactNode } from "react";
import type { MembershipRole, RoomMembershipListItem } from "@/lib/chat/chat-room-contracts";

type ChatRoomParticipantProfileProps = Readonly<{
  displayName: RoomMembershipListItem["displayName"];
  imageUrl: RoomMembershipListItem["imageUrl"];
  isSelf: boolean;
  metadata?: ReactNode;
  role: MembershipRole;
}>;

export function ChatRoomParticipantProfile({
  displayName,
  imageUrl,
  isSelf,
  metadata,
  role,
}: ChatRoomParticipantProfileProps) {
  return (
    <div className="flex min-w-0 max-w-full flex-1 items-center gap-3">
      <ChatRoomParticipantAvatar displayName={displayName} imageUrl={imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-950">
          <span className="min-w-0 flex-1 truncate" title={displayName}>
            {displayName}
          </span>
          {isSelf ? <ParticipantBadge label="나" tone="accent" /> : null}
          {role === "OWNER" ? <ParticipantBadge label="방장" tone="neutral" /> : null}
        </p>
        {metadata ? <div className="mt-1 text-xs text-slate-500">{metadata}</div> : null}
      </div>
    </div>
  );
}

function ChatRoomParticipantAvatar({
  displayName,
  imageUrl,
}: Pick<ChatRoomParticipantProfileProps, "displayName" | "imageUrl">) {
  if (imageUrl) {
    return (
      // Membership profile URL은 Backend 계약이 소유하므로 Next Image host allowlist에 묶지 않는다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="size-10 shrink-0 rounded-full bg-slate-100 object-cover"
        height={40}
        src={imageUrl}
        width={40}
      />
    );
  }

  return (
    <span
      aria-label={`${displayName} 기본 프로필 이미지`}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500"
      data-avatar-fallback="anonymous"
      role="img"
    >
      <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function ParticipantBadge({
  label,
  tone,
}: Readonly<{
  label: string;
  tone: "accent" | "neutral";
}>) {
  return (
    <span
      className={
        tone === "accent"
          ? "shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[0.7rem] font-medium text-blue-700"
          : "shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-medium text-slate-600"
      }
    >
      {label}
    </span>
  );
}
