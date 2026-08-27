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
    const bubbleClassName = `w-full min-w-0 max-w-full whitespace-pre-wrap break-words border px-3 py-3 text-[15px] leading-[1.55] ${
      item.isDeleted
        ? "rounded-t-xl rounded-br-xl rounded-bl-[4px] border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] italic text-[var(--chat-publishing-color-muted)]"
        : failed
          ? "rounded-t-xl rounded-br-[4px] rounded-bl-xl border-red-300 bg-red-50 text-red-950"
          : item.isMine
            ? "rounded-t-xl rounded-br-[4px] rounded-bl-xl border-[var(--chat-publishing-color-primary)] bg-[var(--chat-publishing-color-primary)] text-white"
            : "rounded-t-xl rounded-br-xl rounded-bl-[4px] border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] text-[#1f2124]"
    }`;
    const senderLabel = item.senderLabel ?? (item.isMine ? "나" : null);

    return (
      <li
        className={`flex ${item.isMine ? "justify-end" : "justify-start"}`}
        data-client-message-id={item.clientMessageId}
        data-delivery-status={item.deliveryStatus ?? undefined}
        data-index={virtualIndex}
        data-render-key={item.renderKey}
        data-room-sequence={item.roomSequence ?? undefined}
        data-sender-group-start={item.startsSenderGroup ? "true" : "false"}
        ref={ref}
        style={style}
      >
        <div
          className="relative flex w-fit min-w-0 max-w-[82%] flex-col"
          data-message-bubble-container="true"
        >
          {item.startsSenderGroup ? (
            <div
              className="mb-1 flex min-h-[29px] items-center justify-between gap-3"
              data-message-metadata="visible"
            >
              {senderLabel || item.senderIsOwner ? (
                <span className="inline-flex min-w-0 flex-1 items-center gap-[3px]">
                  {senderLabel ? (
                    <strong
                      className={
                        item.isMine || item.senderIsOwner
                          ? "min-w-0 truncate text-[13px] font-bold leading-[19.5px] text-[var(--chat-publishing-color-muted)]"
                          : "inline-flex h-[29px] max-w-full items-center truncate rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-accent-soft)] px-[6px] text-[13px] font-bold leading-[16.25px] text-[var(--chat-publishing-color-primary-emphasis)]"
                      }
                    >
                      {senderLabel}
                    </strong>
                  ) : null}
                  {item.senderIsOwner ? (
                    <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-[#9ed1fa] bg-[#edf7ff] px-[6px] text-xs font-bold leading-[18px] text-[#085985]">
                      방장
                    </span>
                  ) : null}
                </span>
              ) : (
                <span />
              )}
              <time className="shrink-0 text-xs text-[var(--chat-publishing-color-muted)]">
                {item.timeLabel}
              </time>
            </div>
          ) : (
            <span className="sr-only" data-message-metadata="accessible-only">
              {senderLabel ?? "알 수 없는 참여자"}
              {item.senderIsOwner ? ", 방장" : ""}, {item.timeLabel}
            </span>
          )}
          <div className={`flex w-full min-w-0 ${item.isMine ? "justify-end" : "justify-start"}`}>
            {item.canOpenActions && item.messageId ? (
              <button
                aria-haspopup="dialog"
                className={`${bubbleClassName} cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]`}
                data-message-bubble="true"
                onClick={(event) => onOpenActions(item, event.currentTarget)}
                type="button"
              >
                {item.content}
              </button>
            ) : (
              <p className={bubbleClassName} data-message-bubble="true">
                {item.content}
              </p>
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
              className={
                failed
                  ? "mt-1 px-1 text-[0.7rem] text-red-700"
                  : "chat-message-delivery-pending pointer-events-none absolute -bottom-[18px] right-1 px-1 text-[0.7rem] text-[var(--chat-publishing-color-muted)]"
              }
              data-delivery-indicator={failed ? "error" : "pending"}
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
