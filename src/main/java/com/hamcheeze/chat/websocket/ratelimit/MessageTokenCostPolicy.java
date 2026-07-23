package com.hamcheeze.chat.websocket.ratelimit;

public interface MessageTokenCostPolicy {

    int calculate(int codePointCount);
}
