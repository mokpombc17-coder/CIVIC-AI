import { AccessTokenRefresh } from "@/components/auth/access-token-refresh";
import { safeReturnTarget } from "@/lib/auth/return-target";
import { PlatformPageShell } from "@/components/platform-page-shell";

type RefreshPageProps = Readonly<{
  searchParams: Promise<{ returnTo?: string | string[] }>;
}>;

export default async function RefreshPage({ searchParams }: RefreshPageProps) {
  const value = (await searchParams).returnTo;
  const returnTo = safeReturnTarget(typeof value === "string" ? value : "", "/home");
  return (
    <PlatformPageShell bottomNavigation={null} title="로그인 상태 확인">
      <AccessTokenRefresh returnTo={returnTo} />
    </PlatformPageShell>
  );
}
