package com.hamcheeze.vote.task.application.idempotency;

public final class TaskIdempotencyException extends RuntimeException {

    private final TaskIdempotencyErrorCode code;
    private final int httpStatus;

    private TaskIdempotencyException(
            TaskIdempotencyErrorCode code,
            int httpStatus,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public static TaskIdempotencyException invalidKey(Throwable cause) {
        return new TaskIdempotencyException(
                TaskIdempotencyErrorCode.INVALID_IDEMPOTENCY_KEY,
                400,
                "Idempotency-Key must be a UUID",
                cause);
    }

    public static TaskIdempotencyException conflict() {
        return new TaskIdempotencyException(
                TaskIdempotencyErrorCode.IDEMPOTENCY_CONFLICT,
                409,
                "Idempotency-Key was already used for a different request",
                null);
    }

    public TaskIdempotencyErrorCode code() {
        return code;
    }

    public int httpStatus() {
        return httpStatus;
    }
}
