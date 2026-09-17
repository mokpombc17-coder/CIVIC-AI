"use client";

import { usePathname } from "next/navigation";
import { ParticipantSwipeNavigationController } from "@/components/participant-swipe-navigation-controller";
import { PlatformNavigation } from "@/components/platform-shell";

export function PlatformNavigationClient() {
  const currentPathname = usePathname();

  return (
    <>
      <ParticipantSwipeNavigationController currentPathname={currentPathname} />
      <PlatformNavigation currentPathname={currentPathname} />
    </>
  );
}
