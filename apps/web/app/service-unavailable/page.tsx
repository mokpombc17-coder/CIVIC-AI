import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { getScreenByRoute } from "@/lib/screens/registry";
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function ServiceUnavailablePage() {
  const screen = getScreenByRoute("/service-unavailable");
  if (!screen) throw new TypeError("COMMON-004 screen is missing");
  return (
    <PlatformPageShell title={screen.canonical_title}>
      <MainFunctionalScreen screen={screen} />
    </PlatformPageShell>
  );
}
