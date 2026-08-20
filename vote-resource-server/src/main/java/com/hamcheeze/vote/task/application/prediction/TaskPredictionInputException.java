package com.hamcheeze.vote.task.application.prediction;

import java.util.Objects;

public final class TaskPredictionInputException extends RuntimeException {

    private final ErrorCode code;

    public TaskPredictionInputException(ErrorCode code, String message) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public TaskPredictionInputException(
            ErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ErrorCode code() {
        return code;
    }

    public enum ErrorCode {
        INPUT_UNAVAILABLE,
        FINGERPRINT_MISMATCH,
        INTEGRITY_ERROR
    }
}
