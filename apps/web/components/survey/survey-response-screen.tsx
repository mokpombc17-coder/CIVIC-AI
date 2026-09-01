"use client";

import Link from "next/link";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import styles from "./survey.module.css";

export function SurveyResponseScreen({ responseId }: { responseId?: string }) {
  return (
    <PlatformShell
      contentClassName={styles.content!}
      header={
        <PlatformHeader
          backAction={{ href: "/survey", ariaLabel: "설문 화면으로 돌아가기" }}
          title="내 설문 응답"
        />
      }
    >
      <div
        className={`${styles.screen} ${styles.responseScreen}`}
        data-survey-response-mode={responseId ? "specific" : "latest"}
      >
        <section className={styles.statusCard} role="status">
          <h2>응답 조회는 준비 중입니다.</h2>
          <p>현재 설문은 디자인 확인용 mock 데이터로 동작하며 응답을 저장하지 않습니다.</p>
          <div className={styles.statusActions}>
            <Link className={`${styles.action} ${styles.primaryAction}`} href="/survey">
              설문으로 돌아가기
            </Link>
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
