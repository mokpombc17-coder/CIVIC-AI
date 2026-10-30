package com.hamcheeze.chat.message.search;

import java.time.Duration;

public interface ChatMessageSearchMetrics {

    void request();

    void rateLimited();

    void deadlineReached();

    void success(
            int scanned,
            int matches,
            boolean searchComplete,
            Duration duration
    );

    void failure(
            ChatMessageSearchErrorCode code,
            int scanned,
            int matches,
            Duration duration
    );

    static ChatMessageSearchMetrics noop() {
        return Noop.INSTANCE;
    }

    enum Noop implements ChatMessageSearchMetrics {
        INSTANCE;

        @Override
        public void request() {
        }

        @Override
        public void rateLimited() {
        }

        @Override
        public void deadlineReached() {
        }

        @Override
        public void success(
                int scanned,
                int matches,
                boolean searchComplete,
                Duration duration
        ) {
        }

        @Override
        public void failure(
                ChatMessageSearchErrorCode code,
                int scanned,
                int matches,
                Duration duration
        ) {
        }
    }
}
