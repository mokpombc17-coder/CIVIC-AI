package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

public final class ChatExportException extends RuntimeException {

    private final ChatExportErrorCode code;
    private final HttpStatus status;
    private final boolean retryable;

    public ChatExportException(
            ChatExportErrorCode code,
            HttpStatus status,
            boolean retryable,
            String message
    ) {
        super(message);
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }

    public ChatExportException(
            ChatExportErrorCode code,
            HttpStatus status,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }

    public ChatExportErrorCode code() {
        return code;
    }

    public HttpStatus status() {
        return status;
    }

    public boolean retryable() {
        return retryable;
    }
}
