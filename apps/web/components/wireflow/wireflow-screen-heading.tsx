import type { Route } from "next";
import Link from "next/link";

export function WireflowScreenHeading({
  backHref,
  secondary = false,
  subtitle,
  title,
}: Readonly<{ backHref?: Route; secondary?: boolean; subtitle?: string; title: string }>) {
  return (
    <header
      className="wf-screen-heading"
      data-platform-heading={secondary ? "SECONDARY" : "HIDDEN"}
    >
      {backHref ? (
        <Link aria-label="이전 화면" className="wf-heading-back" href={backHref}>
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d="m15 4-8 8 8 8" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </Link>
      ) : null}
      <div>
        {secondary ? (
          <h2 id="civic-screen-title">{title}</h2>
        ) : (
          <h1 id="civic-screen-title">{title}</h1>
        )}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </header>
  );
}
