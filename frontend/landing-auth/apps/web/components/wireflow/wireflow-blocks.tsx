import type { ReactNode } from "react";
import { WireflowBadge, WireflowCard } from "./wireflow-primitives";

type WireflowActionCardProps = Readonly<{
  action: ReactNode;
  badge: string;
  description: string;
  title: string;
}>;

export function WireflowActionCard({ action, badge, description, title }: WireflowActionCardProps) {
  return (
    <WireflowCard className="wf-action-card">
      <div className="wf-action-copy">
        <WireflowBadge>{badge}</WireflowBadge>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="wf-action-control">{action}</div>
    </WireflowCard>
  );
}
