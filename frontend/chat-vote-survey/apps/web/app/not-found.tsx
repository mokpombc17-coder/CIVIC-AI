import Link from "next/link";
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function NotFound() {
  return (
    <PlatformPageShell
      backAction={{ ariaLabel: "홈으로 돌아가기", href: "/home" }}
      title="페이지 없음"
    >
      <div className="px-4 py-4">
        <section className="panel">
          <p className="eyebrow">404</p>
          <h2>경로를 찾을 수 없습니다.</h2>
          <p>주소를 다시 확인하거나 홈에서 원하는 메뉴로 이동해 주세요.</p>
          <Link className="primary-button link-button" href="/home">
            홈으로 이동
          </Link>
        </section>
      </div>
    </PlatformPageShell>
  );
}
