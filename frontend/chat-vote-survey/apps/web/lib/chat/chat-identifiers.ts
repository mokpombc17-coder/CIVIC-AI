export type ChatUuidGenerator = () => string;

export function createIdempotencyKey(
  generateUuid: ChatUuidGenerator = generateUuidWithWebCrypto,
): string {
  return generateUuid();
}

export function createClientMessageId(
  generateUuid: ChatUuidGenerator = generateUuidWithWebCrypto,
): string {
  return generateUuid();
}

function generateUuidWithWebCrypto(): string {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID !== "function") {
    throw new Error("이 실행 환경에서는 crypto.randomUUID()를 사용할 수 없습니다.");
  }

  return randomUUID.call(globalThis.crypto);
}
