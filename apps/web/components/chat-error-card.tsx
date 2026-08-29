import type { ReactNode } from "react";

export const CHAT_ERROR_CARD_ACTION_CLASS_NAME =
  "inline-flex h-12 min-w-[131px] items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base leading-5 font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]";

type ChatErrorCardProps = Readonly<{
  action: ReactNode;
  ariaLive?: "assertive" | "polite";
  detail: ReactNode;
  title: ReactNode;
}>;

export function ChatErrorCard({ action, ariaLive, detail, title }: ChatErrorCardProps) {
  return (
    <section
      aria-live={ariaLive}
      className="flex min-h-[204px] flex-col rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] px-4 pt-[18px] pb-[18px]"
      role="alert"
    >
      <h2 className="text-base font-bold leading-6 text-[#8a4a08]">{title}</h2>
      <p className="mt-2 text-sm leading-[21px] text-[var(--chat-publishing-color-text)]">
        {detail}
      </p>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">{action}</div>
    </section>
  );
}
