import type { Metadata } from "next";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { screenFrameHeading } from "@/components/screens/screen-frame";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { requireParticipantSession } from "@/lib/auth/require-session";
import { getScreenByRoute } from "@/lib/screens/registry";

export const metadata: Metadata = {
  title: "홈",
};

export default async function HomePage() {
  await requireParticipantSession("/home");
  const screen = getScreenByRoute("/home");
  if (!screen) throw new TypeError("U-HOME-001 screen is missing");
  const heading = screenFrameHeading(screen);

  return (
    <ParticipantShell activeRoute="/home" title={heading.title}>
      <MainFunctionalScreen screen={screen} />
    </ParticipantShell>
  );
}
