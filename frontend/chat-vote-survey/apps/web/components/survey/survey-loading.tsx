import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import styles from "./survey.module.css";

export function SurveyScreenLoading() {
  return (
    <PlatformShell
      contentClassName={styles.content!}
      header={<PlatformHeader className={styles.surveyHeader!} title="설문 정보 입력" />}
      headerSize="compact"
      scroll="child"
    >
      <div className={styles.screen} data-survey-screen="flow">
        <SurveyLoadingStatus />
      </div>
    </PlatformShell>
  );
}

export function SurveyLoadingStatus() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={styles.statusCard}
      data-survey-loading="true"
      role="status"
    >
      <span aria-hidden="true" className={styles.loadingIcon}>
        <span className={styles.loadingIconSpinner} />
      </span>
      <h2>설문을 불러오는 중입니다.</h2>
      <p>참여할 설문 내용을 확인하고 있어요.</p>
    </section>
  );
}
