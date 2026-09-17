import { PlatformPageShell } from "@/components/platform-page-shell";
import { PlatformNavigation } from "@/components/platform-shell";
import { HOME_SERVICE_REGION_LABEL } from "./home-brand-title";
import styles from "./root-loading-shell.module.css";

export function RootLoadingShell() {
  return (
    <PlatformPageShell
      bottomNavigation={<PlatformNavigation currentPathname="" prefetch={false} />}
      contentClassName={styles.content ?? ""}
      title={
        <span
          aria-label={`CIVIC.AI ${HOME_SERVICE_REGION_LABEL}`}
          className={styles.brand}
          data-nosnippet=""
        >
          <span className={styles.brandTitle}>CIVIC.AI</span>{" "}
          <span className={styles.regionBadge}>{HOME_SERVICE_REGION_LABEL}</span>
        </span>
      }
    >
      <section aria-busy="true" aria-live="polite" className={styles.status} role="status">
        <span aria-hidden="true" className={styles.spinner} />
        <h2 className={styles.title}>화면을 준비 중입니다.</h2>
        <p className={styles.description}>잠시만 기다려 주세요.</p>
      </section>
    </PlatformPageShell>
  );
}
