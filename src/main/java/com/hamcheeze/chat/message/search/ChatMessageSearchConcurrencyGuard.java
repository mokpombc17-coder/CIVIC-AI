package com.hamcheeze.chat.message.search;

public interface ChatMessageSearchConcurrencyGuard {

    Permit tryAcquire();

    interface Permit extends AutoCloseable {

        boolean acquired();

        @Override
        void close();
    }

    static ChatMessageSearchConcurrencyGuard unlimited() {
        return () -> new Permit() {
            @Override
            public boolean acquired() {
                return true;
            }

            @Override
            public void close() {
            }
        };
    }
}
