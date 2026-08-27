import type { Metadata } from "next";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { screenFrameHeading } from "@/components/screens/screen-frame";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { hasAccessCredential } from "@/lib/auth/require-access";
import { getScreenByRoute } from "@/lib/screens/registry";

export const metadata: Metadata = {
  title: "홈",
};

export default async function HomePage() {
  const requiresLoginForProtectedLinks = !(await hasAccessCredential());
  const screen = getScreenByRoute("/home");
  if (!screen) throw new TypeError("U-HOME-001 screen is missing");
  const heading = screenFrameHeading(screen);

  return (
    <ParticipantShell
      activeRoute="/home"
      requiresLoginForProtectedLinks={requiresLoginForProtectedLinks}
      title={heading.title}
    >
      <MainFunctionalScreen
        requiresLoginForProtectedLinks={requiresLoginForProtectedLinks}
        screen={screen}
      />
    </ParticipantShell>
  );
}
