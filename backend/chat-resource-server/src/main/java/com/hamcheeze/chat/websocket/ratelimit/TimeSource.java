package com.hamcheeze.chat.websocket.ratelimit;

@FunctionalInterface
public interface TimeSource {

    long nanoTime();
}
