import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type AdminUserLabel = Readonly<{ user_id: string; email: string }>;

export const UNKNOWN_ADMIN_USER_LABEL = "확인할 수 없는 사용자";

export async function requestAdminUserLabels(
  ids: readonly string[],
  request: typeof fetch = authenticatedFetch,
): Promise<Map<string, string> | null> {
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (uniqueIds.length === 0) return new Map();
  const query = new URLSearchParams();
  for (const id of uniqueIds) query.append("ids", id);
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
