import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export const serviceEligibilityQueryKey = ["current-user", "service-eligibility"] as const;
export const serviceEligibilityStaleTimeMs = 5 * 60 * 1_000;

export type VoteServiceEligibility = Readonly<{
  activeRoundId: string | null;
  capabilities: readonly string[];
  eligible: boolean;
  evaluatedAt: string | null;
  nextAction: string | null;
  reason: string | null;
  surveyRequirement: string | null;
}>;

export async function loadServiceEligibility(
  request: typeof fetch = authenticatedFetch,
): Promise<VoteServiceEligibility> {
  const response = await request("/api/v1/me/service-eligibility", {
    cache: "no-store",
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`서비스 이용 자격을 확인하지 못했습니다. (${response.status})`);
  }
  return parseServiceEligibility(await response.json());
}

export function parseServiceEligibility(value: unknown): VoteServiceEligibility {
  if (!isRecord(value) || typeof value.eligible !== "boolean") {
    throw new TypeError("Vote service eligibility response is invalid");
  }
  return {
    activeRoundId: nullableString(value.activeRoundId),
    capabilities: Array.isArray(value.capabilities)
      ? value.capabilities.filter(
          (capability): capability is string => typeof capability === "string",
        )
      : [],
    eligible: value.eligible,
    evaluatedAt: nullableString(value.evaluatedAt),
    nextAction: nullableString(value.nextAction),
    reason: nullableString(value.reason),
    surveyRequirement: nullableString(value.surveyRequirement),
  };
}

export function requiresCurrentSurvey(eligibility: VoteServiceEligibility): boolean {
  return eligibility.eligible === false && eligibility.nextAction === "COMPLETE_CURRENT_SURVEY";
}

export function isServiceEligibilityGuardExemptPath(pathname: string): boolean {
  return (
    pathname === "/survey" ||
    pathname.startsWith("/survey/") ||
    pathname === "/login" ||
    pathname.startsWith("/signup/") ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/")
  );
}

export function surveyLocation(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `/survey?${query.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
