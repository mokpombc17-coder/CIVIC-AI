import type { Route } from "next";
import Link from "next/link";

export function WireflowCommonState({
  action,
  body,
  href,
  title,
}: Readonly<{ action: string; body: string; href: Route; title: string }>) {
  return (
    <section className="wf-common-state">
      <strong>{title}</strong>
      <p>{body}</p>
      <Link className="wf-button wf-button-primary" href={href}>
        {action}
      </Link>
    </section>
  );
}
