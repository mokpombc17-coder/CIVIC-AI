package com.hamcheeze.chat.websocket.ratelimit;

public enum AdmissionOutcome {
    GRANTED,
    USER_RATE_LIMITED,
    GLOBAL_SOURCE_LIMITED
}
