import type { Metadata } from "next";
import { PlatformPageShell } from "@/components/platform-page-shell";

export const metadata: Metadata = {
  title: "홈",
};

export default function HomePage() {
  return <PlatformPageShell title="홈">{null}</PlatformPageShell>;
}
