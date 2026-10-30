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

  it("사용자의 새 operation은 새로운 Idempotency-Key를 발급한다", () => {
    const createKey = vi
      .fn<() => string>()
      .mockReturnValueOnce("91b985ff-9e8e-4fb8-bf02-a360498a3d31")
      .mockReturnValueOnce("1ef50aac-5d83-4a92-9908-0ae96e38a2db");

    const quotaRejectedCommand = createIdempotentCommand(undefined, createKey);
    const commandAfterQuotaResolution = createIdempotentCommand(undefined, createKey);

    expect(commandAfterQuotaResolution.idempotencyKey).not.toBe(
      quotaRejectedCommand.idempotencyKey,
    );
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});
