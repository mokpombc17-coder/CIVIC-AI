type InternalLocation = Readonly<{
  hash: string;
  pathname: string;
  search: string;
}>;

export function getCurrentDocumentPath(location: InternalLocation): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function createRequiredSurveyLocation(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `/survey?${query.toString()}`;
}

export function createEligibilityLoginLocation(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `/login?${query.toString()}`;
}
