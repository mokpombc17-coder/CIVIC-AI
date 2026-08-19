package com.hamcheeze.vote.opinionmap.api;

import org.springframework.http.HttpStatus;

final class OpinionMapApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    OpinionMapApiException(
            HttpStatus status,
            String code,
            String message
    ) {
        super(message);
        this.status = status;
        this.code = code;
    }

    HttpStatus status() {
        return status;
    }

    String code() {
        return code;
    }
}
