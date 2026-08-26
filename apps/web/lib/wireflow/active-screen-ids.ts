export const activeWireflowScreenIds = Object.freeze([
  ...screenRange("AUTH", 10),
  ...screenRange("COMMON", 4),
  "U-HOME-001",
  ...screenRange("U-ACCOUNT", 4),
  "A-HOME-001",
  ...screenRange("A-USER", 5),
  ...screenRange("U-RAG", 3),
  ...screenRange("A-RAG", 6),
] as const);

export type ActiveWireflowScreenId = (typeof activeWireflowScreenIds)[number];

function screenRange(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`,
  );
}
