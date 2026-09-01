export const SURVEY_PATH = "/survey" as const;
export const DEFAULT_SURVEY_RETURN_PATH = "/home" as const;

const SURVEY_RETURN_PATH_BASE_URL = "https://civic-ai.invalid";

export type SurveyReturnPathInput = string | readonly string[] | null | undefined;

export function createSurveyHref(returnTo: string): string {
  const searchParams = new URLSearchParams({
    from: resolveSurveyReturnPath(returnTo),
  });

  return `${SURVEY_PATH}?${searchParams.toString()}`;
}

export function resolveSurveyReturnPath(value: SurveyReturnPathInput): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_SURVEY_RETURN_PATH;
  }

  try {
    const url = new URL(value, SURVEY_RETURN_PATH_BASE_URL);

    if (
      url.origin !== SURVEY_RETURN_PATH_BASE_URL ||
      url.pathname === SURVEY_PATH ||
      url.pathname.startsWith(`${SURVEY_PATH}/`)
    ) {
      return DEFAULT_SURVEY_RETURN_PATH;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_SURVEY_RETURN_PATH;
  }
}
