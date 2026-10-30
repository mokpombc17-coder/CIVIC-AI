package com.hamcheeze.chat.websocket.protocol;

public final class StompPolicyException extends RuntimeException {

    private final String code;

    public StompPolicyException(String code) {
        super(code);
        this.code = code;
    }

    public StompPolicyException(String code, Throwable cause) {
        super(code, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
