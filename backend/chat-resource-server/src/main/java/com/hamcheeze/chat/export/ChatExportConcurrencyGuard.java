package com.hamcheeze.chat.export;

import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ChatExportConcurrencyGuard {

    private final Semaphore semaphore;

    public ChatExportConcurrencyGuard(int maxConcurrentExports) {
        if (maxConcurrentExports < 1) {
            throw new IllegalArgumentException(
                    "maxConcurrentExports must be positive");
        }
        this.semaphore = new Semaphore(maxConcurrentExports);
    }

    public Permit tryAcquire() {
        return semaphore.tryAcquire() ? new Permit(semaphore) : null;
    }

    public static final class Permit implements AutoCloseable {

        private final Semaphore semaphore;
        private final AtomicBoolean released = new AtomicBoolean();

        private Permit(Semaphore semaphore) {
            this.semaphore = semaphore;
        }

        @Override
        public void close() {
            if (released.compareAndSet(false, true)) {
                semaphore.release();
            }
        }
    }
}
