import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { WireflowActionCard } from "./wireflow-blocks";

type ParticipantAction = Readonly<{
  action: ReactNode;
  badge: string;
  description: string;
  title: string;
}>;

export function ParticipantHomeLayout({
  actions,
}: Readonly<{ actions: readonly ParticipantAction[] }>) {
  return (
    <div className="wf-participant-home" data-wireflow-layout="participant-home">
      {actions.map((item) => (
        <WireflowActionCard {...item} key={item.title} />
      ))}
    </div>
  );
}

export function AccountTabs({ active }: Readonly<{ active: "profile" | "security" }>) {
  const tabs: readonly Readonly<{ href: Route; id: "profile" | "security"; label: string }>[] = [
    { href: "/account" as Route, id: "profile", label: "개인정보·설문" },
    { href: "/account/security" as Route, id: "security", label: "보안" },
  ];
  return (
    <nav aria-label="계정 설정" className="wf-account-tabs">
      {tabs.map((tab) => (
        <Link
          aria-current={active === tab.id ? "page" : undefined}
          className="wf-account-tab"
          href={tab.href}
          key={tab.id}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
