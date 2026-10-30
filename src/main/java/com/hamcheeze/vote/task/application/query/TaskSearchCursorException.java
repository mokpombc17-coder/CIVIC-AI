package com.hamcheeze.vote.task.application.query;

public final class TaskSearchCursorException extends IllegalArgumentException {

    public TaskSearchCursorException(String message) {
        super(message);
    }

    public TaskSearchCursorException(String message, Throwable cause) {
        super(message, cause);
    }
}
