import Link from "next/link";
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function NotFound() {
  return (
    <PlatformPageShell
      backAction={{ ariaLabel: "홈으로 돌아가기", href: "/home" }}
      title="페이지 없음"
    >
      <div className="platform-state-page">
        <section className="platform-state-card">
          <p className="platform-state-code">404</p>
          <h2>경로를 찾을 수 없습니다.</h2>
          <p>주소를 다시 확인하거나 홈에서 원하는 메뉴로 이동해 주세요.</p>
          <Link className="platform-state-link" href="/home">
            홈으로 이동
          </Link>
        </section>
      </div>
    </PlatformPageShell>
  );
}
