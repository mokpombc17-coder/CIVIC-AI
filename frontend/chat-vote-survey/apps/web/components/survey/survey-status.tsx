import type { ReactNode } from "react";
import styles from "./survey.module.css";

export function SurveyStatus({
  actions,
  description,
  icon,
  loading = false,
  role = "status",
  title,
}: {
  actions?: ReactNode;
  description?: string;
  icon?: ReactNode;
  loading?: boolean;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <section aria-busy={loading || undefined} className={styles.statusCard} role={role}>
      {loading ? <span aria-hidden="true" className={styles.loadingSpinner} /> : null}
      {icon}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className={styles.statusActions}>{actions}</div> : null}
    </section>
  );
}
