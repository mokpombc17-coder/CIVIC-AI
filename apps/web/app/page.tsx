import { cookies } from "next/headers";
import { NativeBridgePanel } from "@/components/native-bridge-panel";
import { RuntimeQueryPanel } from "@/components/runtime-query-panel";
import { UpstreamHealthPanel } from "@/components/upstream-health-panel";
import { selectWorkspaceAction } from "@/app/actions";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const workspace =
    firstQueryValue(query.workspace) ?? cookieStore.get("demo-workspace")?.value ?? "미선택";
  const actionError = firstQueryValue(query.actionError);

  return (
    <div className="page-stack">
      <section className="hero">
        <p className="eyebrow">One web application, two containers</p>
        <h1>Next.js가 화면과 BFF를 소유하고, Expo는 얇은 네이티브 셸을 담당한다.</h1>
        <p>
          브라우저와 WebView는 같은 URL, 같은 HttpOnly 세션, 같은 Server/Client Component를 사용한다.
          네이티브 코드는 운영체제 경계에서만 개입한다.
        </p>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Server Action</p>
            <h2>UI workflow와 서버 실행 결합</h2>
          </div>
          <span className="status status-success">workspace: {workspace}</span>
        </div>

        <form action={selectWorkspaceAction} className="inline-form">
          <label>
            workspace
            <input defaultValue={workspace === "미선택" ? "" : workspace} name="workspace" required />
          </label>
          <button className="primary-button" type="submit">
            쿠키 저장 후 redirect
          </button>
        </form>

        {actionError ? <p role="alert">1~40자의 workspace 이름을 입력해야 합니다.</p> : null}
      </section>

      <div className="panel-grid">
        <RuntimeQueryPanel />
        <UpstreamHealthPanel />
        <NativeBridgePanel />
      </div>
    </div>
  );
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
