import type { ReactNode } from "react";
import styles from "./fullscreen-status.module.css";

type FullscreenStatusProps = Readonly<{
  action?: ReactNode;
  busy?: boolean;
  description?: ReactNode;
  title: ReactNode;
}>;

/** Route-neutral status surface used before the destination shell is known. */
export function FullscreenStatus({
  action,
  busy = true,
  description,
  title,
}: FullscreenStatusProps) {
  return (
    <section
      aria-busy={busy}
      aria-live="polite"
      className={styles.stage}
      data-fullscreen-status="true"
      role={busy ? "status" : "alert"}
    >
      <div className={styles.content}>
        {busy ? <span aria-hidden="true" className={styles.spinner} /> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </section>
  );
}
