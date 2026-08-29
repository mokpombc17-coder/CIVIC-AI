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
    description: "주제와 관련된 자료를 바탕으로 AI가 답변해 드려요.",
    href: "/rag" as Route,
    label: "질문하기",
    title: "무엇이 궁금한가요?",
  },
  {
    badge: "토론방",
    description: "다른 참여자와 편하게 의견을 나눠보세요.",
    href: "/chat",
    label: "토론하기",
    title: "함께 나누는 의견",
  },
  {
    badge: "투표",
    description: "선택지를 고르고 그 이유를 제출해 보세요.",
    href: "/vote",
    label: "참여하기",
    title: "내 생각을 더하는 한 표",
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
        <h2>배우고, 함께 토론하고, 결정합니다.</h2>
        <p>
          CIVIC.AI와 함께 문서로 정보를 확인하고, 다른 참여자와 의견을 나눈 다음, 나의 생각을 투표로
          남겨보세요.
        </p>
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
