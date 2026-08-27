import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export function mutationFingerprint(path: string, body: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([path, body ?? null]))));
}

export class IdempotentMutationKeys {
  readonly #keys = new Map<string, string>();

  constructor(private readonly createKey: () => string = () => globalThis.crypto.randomUUID()) {}

  keyFor(fingerprint: string): string {
    const existing = this.#keys.get(fingerprint);
    if (existing) return existing;
    const created = this.createKey();
    this.#keys.set(fingerprint, created);
    return created;
  }

  resolve(fingerprint: string): void {
    this.#keys.delete(fingerprint);
  }
}

export function toKoreanCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
