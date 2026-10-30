package com.hamcheeze.chat.export;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminRoomConversationExportRangeTest {

    private static final Instant NOW =
            Instant.parse("2026-08-29T08:00:00Z");

    @Test
    void acceptsInclusiveExclusiveRangeAtConfiguredBoundary() {
        Instant from = NOW.minus(Duration.ofDays(31));

        AdminRoomConversationExportRange range =
                AdminRoomConversationExportRange.validated(
                        from,
                        NOW,
                        NOW,
                        Duration.ofDays(31));

        assertThat(range.fromInclusive()).isEqualTo(from);
        assertThat(range.toExclusive()).isEqualTo(NOW);
    }

    @Test
    void rejectsReversedEmptyFutureAndOversizedRanges() {
        assertInvalid(NOW, NOW, Duration.ofDays(31));
        assertInvalid(NOW, NOW.minusSeconds(1), Duration.ofDays(31));
        assertInvalid(NOW.minusSeconds(1), NOW.plusSeconds(1),
                Duration.ofDays(31));
        assertInvalid(NOW.minus(Duration.ofDays(31)).minusSeconds(1),
                NOW, Duration.ofDays(31));
    }

    private void assertInvalid(
            Instant fromInclusive,
            Instant toExclusive,
            Duration maxRange
    ) {
        assertThatThrownBy(() ->
                AdminRoomConversationExportRange.validated(
                        fromInclusive,
                        toExclusive,
                        NOW,
                        maxRange))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> {
                    ChatExportException exportError =
                            (ChatExportException) error;
                    assertThat(exportError.code()).isEqualTo(
                            ChatExportErrorCode.INVALID_EXPORT_TIME_RANGE);
                    assertThat(exportError.status()).isEqualTo(
                            HttpStatus.BAD_REQUEST);
                    assertThat(exportError.retryable()).isFalse();
                });
    }
}
