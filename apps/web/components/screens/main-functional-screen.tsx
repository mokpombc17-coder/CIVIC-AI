import type { ScreenDefinition } from "@/lib/screens/registry";
import type { Route } from "next";
import Link from "next/link";
import { AccountFunctionalScreen } from "./account-functional-screen";
import { AdminFunctionalScreen } from "./admin-functional-screen";
import { AuthFunctionalScreen } from "./auth-functional-screen";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";
import { WireflowCommonState } from "@/components/wireflow/common-state-layouts";
import { ParticipantHomeLayout } from "@/components/wireflow/participant-layouts";
import type { CurrentUser } from "@/lib/auth/shell-access";

export function MainFunctionalScreen({
  screen,
  initialSearch = "",
  adminCurrentUser,
  requiresLoginForProtectedLinks = false,
}: Readonly<{
  screen: ScreenDefinition;
  initialSearch?: string;
  adminCurrentUser?: Pick<CurrentUser, "role" | "permissions">;
  requiresLoginForProtectedLinks?: boolean;
}>) {
  if (screen.owner !== "MAIN_AUTH" || screen.status !== "FUNCTIONAL") {
    throw new TypeError(`MainFunctionalScreen cannot render ${screen.id}.`);
  }
  if (screen.id.startsWith("AUTH-")) {
    return <AuthFunctionalScreen initialSearch={initialSearch} screen={screen} />;
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
    return (
      <ScreenFrame screen={screen}>
        <ParticipantHomeLayout
          actions={[
            {
              action: (
                <Link
                  className="wf-button wf-button-secondary"
                  href={
                    requiresLoginForProtectedLinks
                      ? (`/login?returnTo=${encodeURIComponent("/votes")}` as Route)
                      : ("/votes" as Route)
                  }
                >
                  과업 보기
                </Link>
              ),
              badge: "투표",
              description: "마감 임박 순으로 확인",
              title: "진행 중 과업",
            },
            {
              action: (
                <Link
                  className="wf-button wf-button-secondary"
                  href={
                    requiresLoginForProtectedLinks
                      ? (`/login?returnTo=${encodeURIComponent("/chat")}` as Route)
                      : ("/chat" as Route)
                  }
                >
                  채팅 보기
                </Link>
              ),
              badge: "채팅",
              description: "참여 중인 방과 새 메시지",
              title: "내 채팅",
            },
            {
              action: (
                <Link
                  className="wf-button wf-button-secondary"
                  href={
                    requiresLoginForProtectedLinks
                      ? (`/login?returnTo=${encodeURIComponent("/rag")}` as Route)
                      : ("/rag" as Route)
                  }
                >
                  질문 시작
                </Link>
              ),
              badge: "문서",
              description: "공개 문서를 근거로 답변",
              title: "문서에 질문하기",
            },
          ]}
        />
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame screen={screen}>
      <WireflowCommonState
        action={action}
        body="자격증명이나 임시 처리 결과를 표시하지 않고 서버의 최신 상태를 다시 확인합니다."
        href={
          (screen.id === "COMMON-001" || screen.id === "COMMON-004"
            ? "/home"
            : screen.route) as Route
        }
        title={stateMessage(screen.id)}
      />
    </ScreenFrame>
  );
}

function stateMessage(id: string) {
  if (id === "COMMON-001") return "이 계정에는 요청한 화면의 권한이 없습니다.";
  if (id === "COMMON-002") return "다른 요청이 먼저 상태를 변경했습니다.";
  if (id === "COMMON-003") return "서버에서 처리 결과를 확인하고 있습니다.";
  return "서비스 연결을 잠시 확인하고 있습니다.";
}
