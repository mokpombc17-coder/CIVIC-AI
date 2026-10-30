package com.hamcheeze.vote.task.application.submission;

public final class TaskSubmissionPersistenceException
        extends RuntimeException {

    public enum ErrorCode {
        USER_ALREADY_SUBMITTED,
        INTEGRITY_CONSTRAINT_VIOLATION
    }

    private final ErrorCode code;

    public TaskSubmissionPersistenceException(
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
