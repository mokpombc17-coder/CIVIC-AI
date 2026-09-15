import { AccessTokenRefresh } from "@/components/auth/access-token-refresh";
import { ParticipantLoadingView } from "@/components/shell/loading-skeletons";
import { safeReturnTarget } from "@/lib/auth/return-target";

type RefreshPageProps = Readonly<{
  searchParams: Promise<{ returnTo?: string | string[] }>;
}>;

export default async function RefreshPage({ searchParams }: RefreshPageProps) {
  const value = (await searchParams).returnTo;
  const returnTo = safeReturnTarget(typeof value === "string" ? value : "", "/home");
  const participantPathname = participantRefreshPathname(returnTo);
  return (
    <AccessTokenRefresh
      {...(participantPathname
        ? { loadingFallback: <ParticipantLoadingView pathname={participantPathname} /> }
        : {})}
      returnTo={returnTo}
    />
  );
}

function participantRefreshPathname(returnTo: string): string | null {
  const pathname = new URL(returnTo, "https://civic.invalid").pathname;
  if (/^\/survey(?:\/|$)/u.test(pathname)) return "/mypage/survey";
  return /^\/(?:account|mypage|rag|chat|vote)(?:\/|$)/u.test(pathname) ? pathname : null;
}
