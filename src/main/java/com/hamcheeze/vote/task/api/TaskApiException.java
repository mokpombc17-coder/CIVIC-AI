package com.hamcheeze.vote.task.api;

import org.springframework.http.HttpStatus;

final class TaskApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    TaskApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    static TaskApiException notFound(String code, String message) {
        return new TaskApiException(HttpStatus.NOT_FOUND, code, message);
    }

    static TaskApiException conflict(String code, String message) {
        return new TaskApiException(HttpStatus.CONFLICT, code, message);
    }

    HttpStatus status() {
        return status;
    }

    String code() {
        return code;
    }
}
