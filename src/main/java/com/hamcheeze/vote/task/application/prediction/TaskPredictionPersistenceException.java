package com.hamcheeze.vote.task.application.prediction;

public final class TaskPredictionPersistenceException
        extends RuntimeException {

    public enum ErrorCode {
        IDENTITY_ALREADY_EXISTS,
        INTEGRITY_CONSTRAINT_VIOLATION
    }

    private final ErrorCode code;

    public TaskPredictionPersistenceException(
            ErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }
}
