import type { Metadata } from "next";
import { PwaStartup } from "@/components/pwa/pwa-startup";

export const metadata: Metadata = {
  title: "시작 중",
};

export default function PwaStartPage() {
  return <PwaStartup />;
}
