import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type AdminUserLabel = Readonly<{ user_id: string; email: string }>;

export const UNKNOWN_ADMIN_USER_LABEL = "확인할 수 없는 사용자";

/** main-auth rejects more than this many ids per user-labels request. */
export const ADMIN_USER_LABEL_BATCH_SIZE = 100;

export async function requestAdminUserLabels(
  ids: readonly string[],
  request: typeof fetch = authenticatedFetch,
): Promise<Map<string, string> | null> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const batches: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += ADMIN_USER_LABEL_BATCH_SIZE) {
    batches.push(uniqueIds.slice(index, index + ADMIN_USER_LABEL_BATCH_SIZE));
  }
  const results = await Promise.all(batches.map((batch) => requestLabelBatch(batch, request)));
  if (results.some((result) => result === null)) return null;
  const labels = new Map<string, string>();
  for (const result of results) for (const [id, email] of result ?? []) labels.set(id, email);
  return labels;
}

async function requestLabelBatch(
  ids: readonly string[],
  request: typeof fetch,
): Promise<Map<string, string> | null> {
  const query = new URLSearchParams();
  for (const id of ids) query.append("ids", id);
  try {
    const response = await request(`/api/v1/admin/user-labels?${query.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return null;
    const labels = new Map<string, string>();
    for (const item of data.items) {
      if (
        !item ||
        typeof item !== "object" ||
        !("user_id" in item) ||
        typeof item.user_id !== "string" ||
        !("email" in item) ||
        typeof item.email !== "string"
      )
        return null;
      labels.set(item.user_id, item.email);
    }
    return labels;
  } catch {
    return null;
  }
}

export function adminUserLabel(
  labels: ReadonlyMap<string, string>,
  userId?: string | null,
): string {
  if (!userId) return "—";
  return labels.get(userId) ?? UNKNOWN_ADMIN_USER_LABEL;
}
