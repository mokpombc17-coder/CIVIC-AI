package com.hamcheeze.civic.auth;

import java.time.Duration;
import java.util.regex.Pattern;

public final class CivicAuthContract {

    public static final String ACCESS_TOKEN_COOKIE =
            "civic_ai_access_token";
    public static final String AUDIENCE = "civic-ai-api";
    public static final String ALGORITHM = "RS256";
    public static final String TOKEN_TYPE = "JWT";
    public static final Duration ACCESS_TOKEN_LIFETIME =
            Duration.ofSeconds(900);
    public static final Duration FUTURE_IAT_TOLERANCE =
            Duration.ofSeconds(30);

    static final Pattern EMAIL = Pattern.compile(
            "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
                    + "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}"
                    + "[A-Za-z0-9])?"
                    + "(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}"
                    + "[A-Za-z0-9])?)+$");

    private CivicAuthContract() {
    }
}
