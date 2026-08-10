package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.search.ChatMessageSearchErrorCode;

import java.time.Duration;

public interface ChatMessageContextMetrics {

    void request();

    void success(Duration duration);

    void failure(
            ChatMessageSearchErrorCode code,
            Duration duration
    );

    static ChatMessageContextMetrics noop() {
        return Noop.INSTANCE;
    }

    enum Noop implements ChatMessageContextMetrics {
        INSTANCE;

        @Override
        public void request() {
        }

        @Override
        public void success(Duration duration) {
        }

        @Override
        public void failure(
                ChatMessageSearchErrorCode code,
                Duration duration
        ) {
        }
    }
}
