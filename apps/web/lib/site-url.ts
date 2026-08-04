export function resolveSiteUrl(rawSiteUrl: string | undefined): URL | null {
  if (!rawSiteUrl?.trim()) {
    return null;
  }

  const siteUrl = new URL(rawSiteUrl);

  if (siteUrl.protocol !== "http:" && siteUrl.protocol !== "https:") {
    throw new TypeError("SITE_URL은 http 또는 https URL이어야 합니다.");
  }

  siteUrl.username = "";
  siteUrl.password = "";
  siteUrl.pathname = "/";
  siteUrl.search = "";
  siteUrl.hash = "";
  return siteUrl;
}
