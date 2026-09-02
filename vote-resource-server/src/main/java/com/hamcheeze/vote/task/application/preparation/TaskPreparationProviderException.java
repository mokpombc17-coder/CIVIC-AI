package com.hamcheeze.vote.task.application.preparation;

public final class TaskPreparationProviderException
        extends RuntimeException {

    private final boolean retryable;
    private final Integer httpStatus;
    private final String code;

    public TaskPreparationProviderException(
            boolean retryable,
            Integer httpStatus,
            String code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.retryable = retryable;
        this.httpStatus = httpStatus;
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("code must not be blank");
        }
        this.code = code.strip();
    }

    public boolean retryable() {
        return retryable;
    }

    public Integer httpStatus() {
        return httpStatus;
    }

    public String code() {
        return code;
    }
}
