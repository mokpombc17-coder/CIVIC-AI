package com.hamcheeze.chat.security;

public final class ChatScopes {

    public static final String CONNECT = "chat:connect";
    public static final String ROOMS_READ = "chat:rooms:read";
    public static final String ROOMS_WRITE = "chat:rooms:write";
    public static final String MESSAGES_WRITE = "chat:messages:write";
    public static final String READ_STATE_WRITE =
            "chat:read-state:write";

    private static final String AUTHORITY_PREFIX = "SCOPE_";

    private ChatScopes() {
    }

    public static String authority(String scope) {
        return AUTHORITY_PREFIX + scope;
    }
}
