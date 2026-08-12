package com.hamcheeze.chat.export;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatExportResourceLimitTest {

    private static final Instant NOW =
            Instant.parse("2026-08-11T03:00:00Z");

    @Test
    void workspaceBudgetCountsActualUtf8BytesDuringWrite()
            throws Exception {
        ByteArrayOutputStream target = new ByteArrayOutputStream();
        ChatExportWorkspaceBudget budget = new ChatExportWorkspaceBudget(5);
        ChatExportBoundedOutputStream output =
                new ChatExportBoundedOutputStream(
                        target,
                        budget,
                        100,
                        deadline());
        byte[] korean = "가".getBytes(StandardCharsets.UTF_8);

        output.write(korean);
        assertThatThrownBy(() -> output.write(korean))
                .isInstanceOf(ChatExportException.class)
                .satisfies(exception -> assertThat(
                        ((ChatExportException) exception).code())
                        .isEqualTo(ChatExportErrorCode
                                .CHAT_EXPORT_TOO_LARGE));

        assertThat(target.size()).isEqualTo(3);
        assertThat(budget.writtenBytes()).isEqualTo(3);
    }

    @Test
    void individualFileLimitStopsWriteImmediately() throws Exception {
        ByteArrayOutputStream target = new ByteArrayOutputStream();
        ChatExportBoundedOutputStream output =
                new ChatExportBoundedOutputStream(
                        target,
                        new ChatExportWorkspaceBudget(100),
                        4,
                        deadline());

        assertThatThrownBy(() -> output.write(new byte[5]))
                .isInstanceOf(ChatExportException.class);
        assertThat(target.size()).isZero();
    }

    @Test
    void deadlineStopsTheNextBufferedWrite() {
        MutableClock clock = new MutableClock(NOW);
        ChatExportDeadline deadline = new ChatExportDeadline(
                clock,
                Duration.ofSeconds(1));
        ByteArrayOutputStream target = new ByteArrayOutputStream();
        ChatExportBoundedOutputStream output =
                new ChatExportBoundedOutputStream(
                        target,
                        new ChatExportWorkspaceBudget(100),
                        100,
                        deadline);
        clock.advance(Duration.ofSeconds(2));

        assertThatThrownBy(() -> output.write(new byte[1]))
                .isInstanceOf(ChatExportException.class)
                .satisfies(exception -> assertThat(
                        ((ChatExportException) exception).code())
                        .isEqualTo(ChatExportErrorCode
                                .CHAT_EXPORT_TOO_LARGE));
        assertThat(target.size()).isZero();
    }

    private ChatExportDeadline deadline() {
        return new ChatExportDeadline(
                Clock.fixed(NOW, ZoneOffset.UTC),
                Duration.ofMinutes(1));
    }

    private static final class MutableClock extends Clock {

        private Instant current;

        private MutableClock(Instant current) {
            this.current = current;
        }

        void advance(Duration duration) {
            current = current.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return current;
        }
    }
}
