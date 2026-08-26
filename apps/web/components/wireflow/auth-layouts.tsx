import type { FormEventHandler, ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { WireflowActionCard } from "./wireflow-blocks";
import { WireflowButton } from "./wireflow-primitives";

type AuthFormCardProps = Readonly<{
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  title: string;
}>;

export function AuthFormCard({ children, onSubmit, title }: AuthFormCardProps) {
  return (
    <form className="wf-auth-form" onSubmit={onSubmit}>
      <header className="wf-card-heading">
        <h2>{title}</h2>
      </header>
      {children}
    </form>
  );
}

type AuthSupportCardProps = Readonly<{
  badge: string;
  description: string;
  href: Route;
  linkLabel: string;
  slot: string;
  title: string;
}>;

export function AuthSupportCard({
  badge,
  description,
  href,
  linkLabel,
  slot,
  title,
}: AuthSupportCardProps) {
  return (
    <div data-wireflow-slot={slot}>
      <WireflowActionCard
        action={<Link href={href}>{linkLabel}</Link>}
        badge={badge}
        description={description}
        title={title}
      />
    </div>
  );
}

type AuthInfoProps = Readonly<{
  actionHref?: Route | undefined;
  actionLabel: string;
  body: string;
  disabled?: boolean | undefined;
  onAction?: (() => void) | undefined;
  title: string;
}>;

export function AuthInfo({
  actionHref,
  actionLabel,
  body,
  disabled,
  onAction,
  title,
}: AuthInfoProps) {
  return (
    <aside className="wf-auth-info">
      <InfoIcon />
      <strong>{title}</strong>
      <p>{body}</p>
      {actionHref ? (
        <Link className="wf-button wf-button-secondary" href={actionHref}>
          {actionLabel}
        </Link>
      ) : (
        <WireflowButton disabled={disabled} onClick={onAction} variant="secondary">
          {actionLabel}
        </WireflowButton>
      )}
    </aside>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="wf-info-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10v6m0-9h.01" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
