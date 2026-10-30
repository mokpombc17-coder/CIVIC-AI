import type { Route } from "next";
import Link from "next/link";
import styles from "./participant-home.module.css";

type ParticipantHomeAction = Readonly<{
  badge: string;
  description: string;
  href: Route;
  label: string;
  title: string;
}>;

const PARTICIPANT_HOME_ACTIONS: readonly ParticipantHomeAction[] = [
  {
    badge: "AI",
    description: "AI가 주제 자료에서 관련 내용을 찾아 답변해 드려요.",
    href: "/rag" as Route,
    label: "질문하기",
    title: "어떤 점부터 짚어볼까요?",
  },
  {
    badge: "토론방",
    description: "관심 있는 주제를 골라 자유롭게 참여해 보세요.",
    href: "/chat",
    label: "토론하기",
    title: "서로 오가는 이야기",
  },
  {
    badge: "투표",
    description: "이유까지 담아 생각을 표현해 보세요.\nAI가 이유 작성을 도와드려요.",
    href: "/vote",
    label: "투표하기",
    title: "논의에 보태는 내 의견",
  },
];

export function ParticipantHomeBrand() {
  return <span className={styles.brand}>CIVIC.AI</span>;
}

export function ParticipantHome() {
  return (
    <div className={styles.root} data-participant-home="true">
      <section className={`${styles.card} ${styles.welcome}`}>
        <span className={styles.badge}>참여 안내</span>
        <h2>의견을 가다듬고, 나누고, 담아내는 곳</h2>
        <p>자료 속 근거를 찾아보고, 다른 참여자와 이야기하며, 내 의견을 남겨보세요.</p>
      </section>

      <div className={styles.actions}>
        {PARTICIPANT_HOME_ACTIONS.map((action) => (
          <ParticipantHomeActionCard action={action} key={action.href} />
        ))}
      </div>
    </div>
  );
}

function ParticipantHomeActionCard({ action }: { action: ParticipantHomeAction }) {
  return (
    <section className={`${styles.card} ${styles.actionCard}`}>
      <div className={styles.actionCopy}>
        <span className={styles.badge}>{action.badge}</span>
        <h2>{action.title}</h2>
        <p>{action.description}</p>
      </div>
      <div className={styles.actionControl}>
        <Link className={styles.primaryAction} href={action.href}>
          {action.label}
        </Link>
      </div>
    </section>
  );
}
