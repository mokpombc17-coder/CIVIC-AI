import type { ScreenDefinition } from "@/lib/screens/registry";
import type { Route } from "next";
import Link from "next/link";
import { AccountFunctionalScreen } from "./account-functional-screen";
import { AdminFunctionalScreen } from "./admin-functional-screen";
import { AuthFunctionalScreen } from "./auth-functional-screen";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";
import {
  WireflowCommonState,
  WireflowConflictState,
  WireflowOutageState,
  WireflowProgressState,
} from "@/components/wireflow/common-state-layouts";
import { WireflowBadge, WireflowCard } from "@/components/wireflow/wireflow-primitives";
import { ParticipantHomeLayout } from "@/components/wireflow/participant-layouts";
import type { CurrentUser } from "@/lib/auth/shell-access";

export function MainFunctionalScreen({
  screen,
  initialSearch = "",
  adminCurrentUser,
  requiresLoginForProtectedLinks = false,
  devQuickLoginEnabled = false,
}: Readonly<{
  screen: ScreenDefinition;
  initialSearch?: string;
  adminCurrentUser?: Pick<CurrentUser, "role" | "permissions">;
  requiresLoginForProtectedLinks?: boolean;
  devQuickLoginEnabled?: boolean;
}>) {
  if (screen.owner !== "MAIN_AUTH" || screen.status !== "FUNCTIONAL") {
    throw new TypeError(`MainFunctionalScreen cannot render ${screen.id}.`);
  }
  if (screen.id.startsWith("AUTH-")) {
    return (
      <AuthFunctionalScreen
        devQuickLoginEnabled={devQuickLoginEnabled}
        initialSearch={initialSearch}
        screen={screen}
      />
    );
  }
  if (screen.id.startsWith("U-ACCOUNT-")) return <AccountFunctionalScreen screen={screen} />;
  if (screen.id.startsWith("A-")) {
    return adminCurrentUser ? (
      <AdminFunctionalScreen adminCurrentUser={adminCurrentUser} screen={screen} />
    ) : (
      <AdminFunctionalScreen screen={screen} />
    );
  }

  const action = mainScreenPrimaryActions[screen.id] ?? "계속";
  if (screen.id === "U-HOME-001") {
    const protectedHref = (path: string) =>
      (requiresLoginForProtectedLinks
        ? `/login?returnTo=${encodeURIComponent(path)}`
        : path) as Route;
    return (
      <ScreenFrame screen={screen}>
        <WireflowCard className="wf-home-welcome">
          <WireflowBadge>참여 안내</WireflowBadge>
          <h2>배우고, 함께 토론하고, 결정합니다.</h2>
          <p>
            CIVIC.AI와 함께 문서로 정보를 확인하고, 다른 참여자와 의견을 나눈 다음, 나의 생각을
            투표로 남겨보세요.
          </p>
        </WireflowCard>
        <ParticipantHomeLayout
          actions={[
            {
              action: (
                <Link className="wf-button wf-button-primary" href={protectedHref("/rag")}>
                  질문하기
                </Link>
              ),
              badge: "AI",
              description: "주제와 관련된 자료를 바탕으로 AI가 답변해 드려요.",
              title: "무엇이 궁금한가요?",
            },
            {
              action: (
                <Link className="wf-button wf-button-primary" href={protectedHref("/chat")}>
                  토론하기
                </Link>
              ),
              badge: "토론방",
              description: "다른 참여자와 편하게 의견을 나눠보세요.",
              title: "함께 나누는 의견",
            },
            {
              action: (
                <Link className="wf-button wf-button-primary" href={protectedHref("/votes")}>
                  참여하기
                </Link>
              ),
              badge: "투표",
              description: "선택지를 고르고 그 이유를 제출해 보세요.",
              title: "내 생각을 더하는 한 표",
            },
          ]}
        />
      </ScreenFrame>
    );
  }
  if (screen.id === "COMMON-002") {
    return (
      <ScreenFrame screen={screen}>
        <WireflowConflictState latestHref={screen.route as Route} listHref={"/votes" as Route} />
      </ScreenFrame>
    );
  }
  if (screen.id === "COMMON-003") {
    return (
      <ScreenFrame screen={screen}>
        <WireflowProgressState homeHref={"/home" as Route} retryHref={screen.route as Route} />
      </ScreenFrame>
    );
  }
  if (screen.id === "COMMON-004") {
    return (
      <ScreenFrame screen={screen}>
        <WireflowOutageState homeHref={"/home" as Route} retryHref={"/home" as Route} />
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame screen={screen}>
      <WireflowCommonState
        action={action}
        body="필요한 권한이 있는 계정으로 다시 로그인하거나, 홈에서 이용 가능한 메뉴를 확인해 주세요."
        href={(screen.id === "COMMON-001" ? "/home" : screen.route) as Route}
        title={stateMessage(screen.id)}
      />
    </ScreenFrame>
  );
}

function stateMessage(id: string) {
  if (id === "COMMON-001") return "이 계정에는 요청한 화면의 권한이 없습니다.";
  return "요청한 화면의 상태를 확인하고 있습니다.";
}
