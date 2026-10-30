package com.hamcheeze.vote.security;

import jakarta.servlet.http.HttpServletRequest;

import java.util.UUID;
import java.util.regex.Pattern;

public final class VoteRequestTraceId {

    public static final String HEADER_NAME = "X-Trace-Id";

    private static final Pattern SAFE_VALUE = Pattern.compile(
            "[A-Za-z0-9._:-]{1,128}");

    private VoteRequestTraceId() {
    }

    public static String resolve(HttpServletRequest request) {
        String requested = request.getHeader(HEADER_NAME);
        if (requested != null) {
            requested = requested.strip();
            if (SAFE_VALUE.matcher(requested).matches()) {
                return requested;
            }
        }
        return UUID.randomUUID().toString();
    }
}
