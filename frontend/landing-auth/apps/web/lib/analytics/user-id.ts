export const ANALYTICS_USER_ID_STORAGE_KEY = "civic.analytics-user-id.v1";

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

type AnalyticsUserIdWriter = Pick<Storage, "setItem">;
type AnalyticsUserIdCleaner = Pick<Storage, "removeItem">;

export function storeAnalyticsUserId(
  userId: unknown,
  storage: AnalyticsUserIdWriter | null = browserSessionStorage(),
): boolean {
  if (typeof userId !== "string" || !uuidPattern.test(userId) || storage === null) return false;
  try {
    storage.setItem(ANALYTICS_USER_ID_STORAGE_KEY, userId);
    return true;
  } catch {
    return false;
  }
}

export function clearAnalyticsUserId(
  storage: AnalyticsUserIdCleaner | null = browserSessionStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.removeItem(ANALYTICS_USER_ID_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
