export type AdminRoomStatus = "ACTIVE" | "CLOSED";
export type AdminRoomVisibility = "LISTED" | "UNLISTED";
export type AdminRoomJoinPolicy = "OPEN" | "INVITE_ONLY";

export type AdminRoomCategorySummary = Readonly<{
  categoryId: string;
  name: string;
}>;

export type AdminRoom = Readonly<{
  roomId: string;
  name: string;
  description: string;
  categoryIds: readonly string[];
  categorySummaries: readonly AdminRoomCategorySummary[];
  ownerMembershipId: string;
  status: AdminRoomStatus;
  visibility: AdminRoomVisibility;
  joinPolicy: AdminRoomJoinPolicy;
  activeMemberCount: number;
  createdAt: string;
  version: number;
}>;

export type AdminRoomPage = Readonly<{
  items: readonly AdminRoom[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

export function readAdminRoomPage(value: unknown): AdminRoomPage | null {
  const record = object(value);
  if (!record || !Array.isArray(record.items) || typeof record.hasNext !== "boolean") return null;
  const items = record.items.map(readAdminRoom);
  if (!items.every(Boolean)) return null;
  const nextCursor =
    record.nextCursor === null || record.nextCursor === undefined
      ? null
      : nonEmptyString(record.nextCursor);
  if (record.nextCursor !== null && record.nextCursor !== undefined && nextCursor === null) {
    return null;
  }
  if (record.hasNext && !nextCursor) return null;
  return { items: items as AdminRoom[], nextCursor, hasNext: record.hasNext };
}

function readAdminRoom(value: unknown): AdminRoom | null {
  const record = object(value);
  if (!record) return null;
  const roomId = nonEmptyString(record.roomId);
  const name = nonEmptyString(record.name);
  const description = string(record.description);
  const categoryIds = stringArray(record.categoryIds);
  const categorySummaries = categorySummaryArray(record.categorySummaries);
  const ownerMembershipId = nonEmptyString(record.ownerMembershipId);
  const status = enumValue(record.status, ["ACTIVE", "CLOSED"] as const);
  const visibility = enumValue(record.visibility, ["LISTED", "UNLISTED"] as const);
  const joinPolicy = enumValue(record.joinPolicy, ["OPEN", "INVITE_ONLY"] as const);
  const activeMemberCount = nonNegativeInteger(record.activeMemberCount);
  const createdAt = nonEmptyString(record.createdAt);
  const version = nonNegativeInteger(record.version);
  if (
    !roomId ||
    !name ||
    description === null ||
    !categoryIds ||
    !categorySummaries ||
    !ownerMembershipId ||
    !status ||
    !visibility ||
    !joinPolicy ||
    activeMemberCount === null ||
    !createdAt ||
    version === null
  ) {
    return null;
  }
  return {
    roomId,
    name,
    description,
    categoryIds,
    categorySummaries,
    ownerMembershipId,
    status,
    visibility,
    joinPolicy,
    activeMemberCount,
    createdAt,
    version,
  };
}

function categorySummaryArray(value: unknown): readonly AdminRoomCategorySummary[] | null {
  if (!Array.isArray(value)) return null;
  const summaries = value.map((item) => {
    const record = object(item);
    const categoryId = record && nonEmptyString(record.categoryId);
    const name = record && nonEmptyString(record.name);
    return categoryId && name ? { categoryId, name } : null;
  });
  return summaries.every(Boolean) ? (summaries as AdminRoomCategorySummary[]) : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : null;
}
