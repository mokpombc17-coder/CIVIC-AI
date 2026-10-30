import type { ScreenDefinition } from "@/lib/screens/registry";
import type { Route } from "next";
import { AccountFunctionalScreen } from "./account-functional-screen";
import { AuthFunctionalScreen } from "./auth-functional-screen";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";
import {
  WireflowCommonState,
  WireflowConflictState,
  WireflowOutageState,
  WireflowProgressState,
} from "@/components/wireflow/common-state-layouts";

export function MainFunctionalScreen({
  screen,
  initialSearch = "",
  devQuickLoginEnabled = false,
}: Readonly<{
  screen: ScreenDefinition;
  initialSearch?: string;
  devQuickLoginEnabled?: boolean;
}>) {
  if (
    screen.owner !== "MAIN_AUTH" ||
    screen.status !== "FUNCTIONAL" ||
    screen.audience === "ADMIN" ||
    screen.id === "U-HOME-001"
  ) {
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
  const action = mainScreenPrimaryActions[screen.id] ?? "계속";
  if (screen.id === "COMMON-002") {
    return (
      <ScreenFrame screen={screen}>
        <WireflowConflictState latestHref={screen.route as Route} listHref={"/vote" as Route} />
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
