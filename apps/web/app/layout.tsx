import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import "./wireflow.css";
import "./admin-console.css";
import { AppShell } from "@/components/app-shell";
import { StyleNonceProvider } from "@/components/admin/console/style-nonce-context";
import { AppQueryProvider } from "@/components/providers/app-query-provider";
import { resolveSiteUrl } from "@/lib/site-url";

const siteUrl = resolveSiteUrl(process.env.SITE_URL);

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  applicationName: "CIVIC.AI",
  description: "자료를 확인하고 의견을 나누며 투표에 참여하는 시민 참여 플랫폼",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CIVIC.AI",
  },
  icons: {
    icon: [
      { url: "/icons/civic-ai-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/civic-ai-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  title: {
    default: "CIVIC.AI",
    template: "%s | CIVIC.AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7fb",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ko">
      <head>
        <link
          crossOrigin="anonymous"
          href="/fonts/pretendard-gov/PretendardGOV-Regular.subset.woff2"
          rel="preload"
          type="font/woff2"
        />
      </head>
      <body>
        <StyleNonceProvider nonce={nonce}>
          <AppQueryProvider>
            <AppShell>{children}</AppShell>
          </AppQueryProvider>
        </StyleNonceProvider>
      </body>
    </html>
  );
}
