import { AccessTokenRefresh } from "@/components/auth/access-token-refresh";
import { safeReturnTarget } from "@/lib/auth/return-target";

type RefreshPageProps = Readonly<{
  searchParams: Promise<{ returnTo?: string | string[] }>;
}>;

export default async function RefreshPage({ searchParams }: RefreshPageProps) {
  const value = (await searchParams).returnTo;
  const returnTo = safeReturnTarget(typeof value === "string" ? value : "", "/home");
  return <AccessTokenRefresh returnTo={returnTo} />;
}
