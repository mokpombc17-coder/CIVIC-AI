import { forwardRef, type CSSProperties } from "react";
import { ChatMessageActionsPopover } from "@/components/chat-message-actions-popover";
import type { ChatMessageMutationStartResult } from "@/components/chat-message-mutation-state";
import type { ChatMessageItemViewModel } from "@/components/chat-room-view-model";

type ChatMessageItemProps = Readonly<{
  item: ChatMessageItemViewModel;
  onDeleteMessage: (messageId: string) => ChatMessageMutationStartResult;
  onEditMessage: (messageId: string, content: string) => ChatMessageMutationStartResult;
  style: CSSProperties;
  virtualIndex: number;
}>;

export const ChatMessageItem = forwardRef<HTMLLIElement, ChatMessageItemProps>(
  function ChatMessageItem({ item, onDeleteMessage, onEditMessage, style, virtualIndex }, ref) {
    const failed = item.deliveryTone === "error";
    const bubbleClassName = `whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
      item.isDeleted
        ? "border border-slate-200 bg-slate-100 italic text-slate-500"
        : item.deliveryTone !== null
          ? failed
            ? "rounded-br-md border border-red-300 bg-red-50 text-red-950"
            : "rounded-br-md border border-blue-500 bg-blue-600 text-white opacity-80"
          : item.isMine
            ? "rounded-br-md bg-blue-700 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
    }`;

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
        <div className={`max-w-[78%] ${item.isMine ? "items-end" : "items-start"} flex flex-col`}>
          {item.senderLabel ? (
            <span className="mb-1 px-1 text-xs font-semibold text-slate-600">
              {item.senderLabel}
            </span>
          ) : null}
          <div className="flex items-end gap-2">
            {item.isMine ? (
              <span className="text-[0.7rem] text-slate-400">{item.timeLabel}</span>
            ) : null}
            {item.canMutate && item.messageId ? (
              <ChatMessageActionsPopover
                content={item.content}
                mutation={item.mutation}
                onDelete={() => onDeleteMessage(item.messageId!)}
                onEdit={(content) => onEditMessage(item.messageId!, content)}
                triggerClassName={bubbleClassName}
              />
            ) : (
              <p className={bubbleClassName}>{item.content}</p>
            )}
            {!item.isMine ? (
              <span className="text-[0.7rem] text-slate-400">{item.timeLabel}</span>
            ) : null}
          </div>
          {item.isEdited ? (
            <p className="mt-1 px-1 text-[0.7rem] text-slate-400">(수정됨)</p>
          ) : null}
          {item.deliveryLabel ? (
            <p
              className={`mt-1 px-1 text-[0.7rem] ${failed ? "text-red-700" : "text-slate-500"}`}
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
