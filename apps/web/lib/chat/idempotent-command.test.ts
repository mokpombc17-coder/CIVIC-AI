import { describe, expect, it, vi } from "vitest";
import { createIdempotentCommand } from "./idempotent-command";

describe("createIdempotentCommand", () => {
  it("Command 생성 시 key를 한 번만 발급하고 body와 함께 보관한다", () => {
    const body = {
      visibility: "LISTED",
      joinPolicy: "OPEN",
    } as const;
    const createKey = vi.fn(() => "07af9111-3e20-43e5-ae80-78d1bf547647");

    const command = createIdempotentCommand(body, createKey);

    expect(command).toEqual({
      idempotencyKey: "07af9111-3e20-43e5-ae80-78d1bf547647",
      body,
    });
    expect(command.body).toBe(body);
    expect(createKey).toHaveBeenCalledOnce();
  });

  it("같은 Command 객체를 재사용하면 Idempotency-Key도 유지된다", () => {
    const createKey = vi.fn(() => "91b985ff-9e8e-4fb8-bf02-a360498a3d31");
    const command = createIdempotentCommand(undefined, createKey);

    const firstAttempt = command;
    const retryAttempt = command;

    expect(retryAttempt.idempotencyKey).toBe(firstAttempt.idempotencyKey);
    expect(createKey).toHaveBeenCalledOnce();
  });
});
