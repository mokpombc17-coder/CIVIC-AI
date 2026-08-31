import generatedRegistry from "./screens.v1.generated.json";

export type ScreenAudience = "PUBLIC" | "PARTICIPANT" | "ADMIN" | "AUTHENTICATED";
export type ScreenStatus = "FUNCTIONAL" | "PLACEHOLDER";
export type ScreenOwner = "MAIN_AUTH" | "RAG" | "CHAT" | "DECISION" | "SIMULATION";

export type ScreenDefinition = Readonly<{
  id: string;
  canonical_title: string;
  audience: ScreenAudience;
  route: string;
  status: ScreenStatus;
  owner: ScreenOwner;
  source_heading: string;
}>;

const allowedAudiences = new Set<ScreenAudience>([
  "PUBLIC",
  "PARTICIPANT",
  "ADMIN",
  "AUTHENTICATED",
]);
const allowedStatuses = new Set<ScreenStatus>(["FUNCTIONAL", "PLACEHOLDER"]);
const allowedOwners = new Set<ScreenOwner>(["MAIN_AUTH", "RAG", "CHAT", "DECISION", "SIMULATION"]);

function readGeneratedRegistry(): readonly ScreenDefinition[] {
  if (generatedRegistry.version !== 1 || generatedRegistry.screens.length !== 70) {
    throw new Error("Unsupported CIVIC screen registry artifact.");
  }

  return Object.freeze(
    generatedRegistry.screens.map((screen) => {
      if (
        !allowedAudiences.has(screen.audience as ScreenAudience) ||
        !allowedStatuses.has(screen.status as ScreenStatus) ||
        !allowedOwners.has(screen.owner as ScreenOwner)
      ) {
        throw new Error(`Invalid screen registry entry: ${screen.id}`);
      }

      return Object.freeze(screen) as ScreenDefinition;
    }),
  );
}

export const screenRegistry = readGeneratedRegistry();

const screensByRoute = new Map(screenRegistry.map((screen) => [screen.route, screen]));

export function getScreenByRoute(pathname: string): ScreenDefinition | undefined {
  const withoutTrailingSlash =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const normalized = withoutTrailingSlash
    .replace(/^\/mypage(?=\/|$)/u, "/account")
    .replace(/^\/account\/security$/u, "/account/profile");
  return screensByRoute.get(normalized);
}
