import type { Metadata } from "next";
import { LocalE2ELoginControl } from "@/components/local-e2e-login-control";
import { ParticipantHome, ParticipantHomeBrand } from "@/components/participant-home";
import { PlatformPageShell } from "@/components/platform-page-shell";

export const metadata: Metadata = {
  title: "홈",
};

export default function HomePage() {
  return (
    <PlatformPageShell
      headerActions={process.env.NODE_ENV !== "production" ? <LocalE2ELoginControl /> : undefined}
      title={<ParticipantHomeBrand />}
    >
      <ParticipantHome />
    </PlatformPageShell>
  );
}
