"use client";

import { usePathname } from "next/navigation";
import { PlatformNavigation } from "@/components/platform-shell";

export function PlatformNavigationClient() {
  return <PlatformNavigation currentPathname={usePathname()} />;
}
