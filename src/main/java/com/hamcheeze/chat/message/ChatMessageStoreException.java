package com.hamcheeze.chat.message;

public final class ChatMessageStoreException extends RuntimeException {

    public ChatMessageStoreException(String message) {
        super(message);
    }

    public ChatMessageStoreException(
            String message,
            Throwable cause
    ) {
        super(message, cause);
    }
}
