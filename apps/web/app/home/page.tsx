import type { Metadata } from "next";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { LocalE2ELoginControl } from "@/components/local-e2e-login-control";

export const metadata: Metadata = {
  title: "홈",
};

export default function HomePage() {
  return (
    <PlatformPageShell title="홈">
      <div className="page-stack px-4 py-4">
        <section className="hero">
          <p className="eyebrow">One web application, two containers</p>
          <h2>Next.js가 화면과 BFF를 소유하고, Expo는 얇은 네이티브 셸을 담당한다.</h2>
          <p>
            브라우저와 WebView는 같은 URL, 같은 HttpOnly 세션, 같은 Server/Client Component를
            사용한다. 네이티브 코드는 운영체제 경계에서만 개입한다.
          </p>
        </section>
        {process.env.NODE_ENV !== "production" ? (
          <section className="panel">
            <h2>로컬 E2E 인증</h2>
            <p>개발자 노트북에서 로컬 채팅 프로세스를 확인할 E2E 세션을 발급합니다.</p>
            <LocalE2ELoginControl />
          </section>
        ) : null}
      </div>
    </PlatformPageShell>
  );
}
