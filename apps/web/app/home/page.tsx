import type { Metadata } from "next";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { TemporaryLoginControl } from "@/components/temporary-login-control";

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
            <h2>개발용 인증</h2>
            <p>로컬 채팅 기능을 확인할 임시 세션을 발급합니다.</p>
            <TemporaryLoginControl />
          </section>
        ) : null}
      </div>
    </PlatformPageShell>
  );
}
