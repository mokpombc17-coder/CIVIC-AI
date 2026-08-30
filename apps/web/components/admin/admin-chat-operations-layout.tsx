import type { ReactNode } from "react";
import styles from "./admin-chat-operations-layout.module.css";

export function AdminChatOperationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.layout}>{children}</div>;
}
