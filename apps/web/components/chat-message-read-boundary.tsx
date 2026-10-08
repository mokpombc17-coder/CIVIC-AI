"use client";

import { forwardRef, type CSSProperties } from "react";

type ChatMessageReadBoundaryProps = Readonly<{
  afterSequence: number;
  renderKey: string;
  style: CSSProperties;
  virtualIndex: number;
}>;

export const ChatMessageReadBoundary = forwardRef<HTMLLIElement, ChatMessageReadBoundaryProps>(
  function ChatMessageReadBoundary({ afterSequence, renderKey, style, virtualIndex }, ref) {
    return (
      <li
        aria-label="여기까지 읽었습니다"
        className="flex items-center gap-3 pb-[14px] text-xs font-medium text-[var(--chat-publishing-color-muted)]"
        data-index={virtualIndex}
        data-read-boundary-after-sequence={afterSequence}
        data-render-key={renderKey}
        ref={ref}
        role="separator"
        style={style}
      >
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--chat-publishing-color-border)]" />
        <span>여기까지 읽었습니다</span>
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--chat-publishing-color-border)]" />
      </li>
    );
  },
);
