import { createIdempotencyKey } from "./chat-identifiers";

export type IdempotentCommand<TBody> = Readonly<{
  idempotencyKey: string;
  body: TBody;
}>;

type IdempotencyKeyFactory = () => string;

export function createIdempotentCommand<TBody>(
  body: TBody,
  createKey: IdempotencyKeyFactory = createIdempotencyKey,
): IdempotentCommand<TBody> {
  return {
    idempotencyKey: createKey(),
    body,
  };
}
