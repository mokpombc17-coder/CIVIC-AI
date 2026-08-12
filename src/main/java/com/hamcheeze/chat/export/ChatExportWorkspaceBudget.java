package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

public final class ChatExportWorkspaceBudget {

    private final long maxBytes;
    private long writtenBytes;

    public ChatExportWorkspaceBudget(long maxBytes) {
        if (maxBytes < 1) {
            throw new IllegalArgumentException("maxBytes must be positive");
        }
        this.maxBytes = maxBytes;
    }

    public synchronized void consume(long bytes) {
        if (bytes < 0) {
            throw new IllegalArgumentException("bytes must not be negative");
        }
        final long next;
        try {
            next = Math.addExact(writtenBytes, bytes);
        } catch (ArithmeticException exception) {
            throw tooLarge();
        }
        if (next > maxBytes) {
            throw tooLarge();
        }
        writtenBytes = next;
    }

    public synchronized long writtenBytes() {
        return writtenBytes;
    }

    private ChatExportException tooLarge() {
        return new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                HttpStatus.PAYLOAD_TOO_LARGE,
                false,
                "Export workspace size limit exceeded");
    }
}
