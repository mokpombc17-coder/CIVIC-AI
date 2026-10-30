package com.hamcheeze.chat.application;

public final class ChatValidationException extends RuntimeException {

    private final ChatCommandRejectedCode code;
    private final String responseClientMessageId;

    public ChatValidationException(
            ChatCommandRejectedCode code,
            String responseClientMessageId
    ) {
        super(code.name());
        this.code = code;
        this.responseClientMessageId = responseClientMessageId;
    }

    public ChatCommandRejectedCode code() {
        return code;
    }

    public String responseClientMessageId() {
        return responseClientMessageId;
    }
}
