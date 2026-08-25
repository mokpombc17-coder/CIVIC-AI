import { forwardRef, type CSSProperties } from "react";
import type { ChatMessageItemViewModel } from "@/components/chat-room-view-model";

type ChatMessageItemProps = Readonly<{
  item: ChatMessageItemViewModel;
  onOpenActions: (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => void;
  style: CSSProperties;
  virtualIndex: number;
}>;

export const ChatMessageItem = forwardRef<HTMLLIElement, ChatMessageItemProps>(
  function ChatMessageItem({ item, onOpenActions, style, virtualIndex }, ref) {
    const failed = item.deliveryTone === "error";
    const bubbleClassName = `w-full whitespace-pre-wrap break-words border px-3 py-3 text-[15px] leading-[1.55] ${
      item.isDeleted
        ? "rounded-t-xl rounded-br-xl rounded-bl-[4px] border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] italic text-[var(--chat-publishing-color-muted)]"
        : item.deliveryTone !== null
          ? failed
            ? "rounded-t-xl rounded-br-[4px] rounded-bl-xl border-red-300 bg-red-50 text-red-950"
            : "rounded-t-xl rounded-br-[4px] rounded-bl-xl border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-primary)] text-white opacity-80"
          : item.isMine
            ? "rounded-t-xl rounded-br-[4px] rounded-bl-xl border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-primary)] text-white"
            : "rounded-t-xl rounded-br-xl rounded-bl-[4px] border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] text-[#1f2124]"
    }`;
    const senderLabel = item.isMine ? "나" : item.senderLabel;

    return (
      <li
        className={`flex ${item.isMine ? "justify-end" : "justify-start"}`}
        data-client-message-id={item.clientMessageId}
        data-delivery-status={item.deliveryStatus ?? undefined}
        data-index={virtualIndex}
        data-render-key={item.renderKey}
        data-room-sequence={item.roomSequence ?? undefined}
        ref={ref}
        style={style}
      >
        <div className="flex w-full max-w-[82%] flex-col">
          <div className="mb-1 flex min-h-7 items-center justify-between gap-3">
            {senderLabel ? (
              <span
                className={
                  item.isMine
                    ? "px-0 text-[13px] font-bold text-[var(--chat-publishing-color-muted)]"
                    : "inline-flex min-h-7 items-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-accent-soft)] px-2 text-[13px] font-bold text-[var(--chat-publishing-color-primary-emphasis)]"
                }
              >
                {senderLabel}
              </span>
            ) : (
              <span />
            )}
            <time className="shrink-0 text-xs text-[var(--chat-publishing-color-muted)]">
              {item.timeLabel}
            </time>
          </div>
          <div className="w-full">
            {item.canOpenActions && item.messageId ? (
              <button
                aria-haspopup="dialog"
                className={`${bubbleClassName} cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]`}
                onClick={(event) => onOpenActions(item, event.currentTarget)}
                type="button"
              >
                {item.content}
              </button>
            ) : (
              <p className={bubbleClassName}>{item.content}</p>
            )}
          </div>
          {item.isEdited ? (
            <p className="mt-1 px-1 text-[0.7rem] text-[var(--chat-publishing-color-muted)]">
              (수정됨)
            </p>
          ) : null}
          {item.readReceiptLabel ? (
            <p
              className="mt-1 px-1 text-[0.7rem] text-[var(--chat-publishing-color-muted)]"
              data-read-count={item.readCount ?? undefined}
            >
              {item.readReceiptLabel}
            </p>
          ) : null}
          {item.deliveryLabel ? (
            <p
              className={`mt-1 px-1 text-[0.7rem] ${failed ? "text-red-700" : "text-[var(--chat-publishing-color-muted)]"}`}
              role={failed ? "alert" : "status"}
            >
              {item.deliveryLabel}
            </p>
          ) : null}
        </div>
      </li>
    );
  },
);
