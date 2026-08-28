export const DEFAULT_ROOM_CATEGORY_ID = "00000000-0000-0000-0000-000000000001";

export type RoomCategory = Readonly<{
  categoryId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}>;

export type RoomCategoryPage = Readonly<{ items: readonly RoomCategory[] }>;

export type ListedRoom = Readonly<{
  roomId: string;
  name: string;
  categoryIds: readonly string[];
  activeMemberCount: number;
  version: number;
}>;

export type ListedRoomPage = Readonly<{
  items: readonly ListedRoom[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

export type RoomDetailCategorySnapshot = Readonly<{
  roomId: string;
  categoryIds: readonly string[];
  version: number;
}>;

export type RoomCategoryAssignment = Readonly<{
  roomId: string;
  categoryIds: readonly string[];
  roomVersion: number;
  changed: boolean;
}>;

export function readListedRoomPage(value: unknown): ListedRoomPage | null {
  const record = object(value);
  if (!record || !Array.isArray(record.items) || typeof record.hasNext !== "boolean") return null;
  const items = record.items.map(readListedRoom);
  if (!items.every(Boolean)) return null;
  const nextCursor = record.nextCursor === null ? null : nonEmptyString(record.nextCursor);
  if (record.nextCursor !== null && nextCursor === null) return null;
  if (record.hasNext && !nextCursor) return null;
  return { items: items as ListedRoom[], nextCursor, hasNext: record.hasNext };
}

function readListedRoom(value: unknown): ListedRoom | null {
  const record = object(value);
  if (!record) return null;
  const roomId = nonEmptyString(record.roomId);
  const name = nonEmptyString(record.name);
  const categoryIds = stringArray(record.categoryIds);
  const activeMemberCount = nonNegativeInteger(record.activeMemberCount);
  const version = nonNegativeInteger(record.version);
  return roomId && name && categoryIds && activeMemberCount !== null && version !== null
    ? { roomId, name, categoryIds, activeMemberCount, version }
    : null;
}

export function readRoomCategoryPage(value: unknown): RoomCategoryPage | null {
  const record = object(value);
  if (!record || !Array.isArray(record.items)) return null;
  const items = record.items.map(readRoomCategory);
  return items.every(Boolean) ? { items: items as RoomCategory[] } : null;
}

export function readRoomCategory(value: unknown): RoomCategory | null {
  const record = object(value);
  if (!record) return null;
  const categoryId = nonEmptyString(record.categoryId);
  const name = nonEmptyString(record.name);
  const createdAt = nonEmptyString(record.createdAt);
  const updatedAt = nonEmptyString(record.updatedAt);
  const version = nonNegativeInteger(record.version);
  return categoryId && name && createdAt && updatedAt && version !== null
    ? { categoryId, name, createdAt, updatedAt, version }
    : null;
}

export function readRoomDetailCategorySnapshot(value: unknown): RoomDetailCategorySnapshot | null {
  const record = object(value);
  if (!record) return null;
  const roomId = nonEmptyString(record.roomId);
  const categoryIds = stringArray(record.categoryIds);
  const version = nonNegativeInteger(record.version);
  return roomId && categoryIds && version !== null ? { roomId, categoryIds, version } : null;
}

export function readRoomCategoryAssignment(value: unknown): RoomCategoryAssignment | null {
  const record = object(value);
  if (!record) return null;
  const roomId = nonEmptyString(record.roomId);
  const categoryIds = stringArray(record.categoryIds);
  const roomVersion = nonNegativeInteger(record.roomVersion);
  return roomId && categoryIds && roomVersion !== null && typeof record.changed === "boolean"
    ? { roomId, categoryIds, roomVersion, changed: record.changed }
    : null;
}

export function sortRoomCategories(items: readonly RoomCategory[]): readonly RoomCategory[] {
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, "ko-KR", { sensitivity: "base" }),
  );
}

export function validateCategorySelection(categoryIds: readonly string[]): string | null {
  if (categoryIds.length < 1) return "카테고리를 1개 이상 선택해 주세요.";
  if (categoryIds.length > 5) return "카테고리는 5개 이하로 선택해 주세요.";
  if (new Set(categoryIds).size !== categoryIds.length) return "중복된 카테고리를 제거해 주세요.";
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
