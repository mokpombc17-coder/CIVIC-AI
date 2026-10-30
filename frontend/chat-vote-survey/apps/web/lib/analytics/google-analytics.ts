export const ANALYTICS_USER_ID_STORAGE_KEY = "civic.analytics-user-id.v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GoogleAnalyticsEventParameters = Readonly<Record<string, string | number | boolean>>;

type GoogleTag = {
  (command: "set", parameters: { user_id: string }): void;
  (
    command: "event",
    eventName: string,
    parameters: GoogleAnalyticsEventParameters & { user_id: string },
  ): void;
};

export type GoogleAnalyticsTarget = {
  dataLayer?: unknown[];
  gtag?: GoogleTag;
  sessionStorage: Pick<Storage, "getItem">;
};

export function readStoredGoogleAnalyticsUserId(storage: Pick<Storage, "getItem">): string | null {
  let userId: string | null;

  try {
    userId = storage.getItem(ANALYTICS_USER_ID_STORAGE_KEY);
  } catch {
    return null;
  }

  return userId && UUID_PATTERN.test(userId) ? userId : null;
}

export function applyStoredGoogleAnalyticsUserId(target: GoogleAnalyticsTarget): boolean {
  const userId = readStoredGoogleAnalyticsUserId(target.sessionStorage);
  if (!userId) return false;

  if (target.gtag) {
    target.gtag("set", { user_id: userId });
    return true;
  }

  pushGoogleTagArguments(target, createGoogleTagArguments("set", { user_id: userId }));
  return true;
}

export function sendGoogleAnalyticsEvent(
  target: GoogleAnalyticsTarget,
  eventName: string,
  parameters: GoogleAnalyticsEventParameters,
): boolean {
  const userId = readStoredGoogleAnalyticsUserId(target.sessionStorage);
  if (!userId) return false;

  const identifiedParameters = { ...parameters, user_id: userId };

  if (target.gtag) {
    target.gtag("event", eventName, identifiedParameters);
    return true;
  }

  pushGoogleTagArguments(
    target,
    createGoogleTagArguments("event", eventName, identifiedParameters),
  );
  return true;
}

function pushGoogleTagArguments(target: GoogleAnalyticsTarget, args: IArguments): void {
  const dataLayer = target.dataLayer ?? [];
  target.dataLayer = dataLayer;
  dataLayer.push(args);
}

function createGoogleTagArguments(command: "set", parameters: { user_id: string }): IArguments;
function createGoogleTagArguments(
  command: "event",
  eventName: string,
  parameters: GoogleAnalyticsEventParameters & { user_id: string },
): IArguments;
function createGoogleTagArguments(
  command: "set" | "event",
  eventNameOrParameters:
    | string
    | (GoogleAnalyticsEventParameters & {
        user_id: string;
      }),
  parameters?: GoogleAnalyticsEventParameters & { user_id: string },
): IArguments {
  // gtag queues the function's arguments object in dataLayer.
  void command;
  void eventNameOrParameters;
  void parameters;
  // eslint-disable-next-line prefer-rest-params
  return arguments;
}
