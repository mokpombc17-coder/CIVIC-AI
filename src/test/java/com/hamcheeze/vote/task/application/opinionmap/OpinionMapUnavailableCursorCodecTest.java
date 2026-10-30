package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapUnavailableCursorCodecTest {

    private final OpinionMapUnavailableCursorCodec codec =
            new OpinionMapUnavailableCursorCodec();

    @Test
    void roundTripsCursor() {
        OpinionMapUnavailableCursor cursor = new OpinionMapUnavailableCursor(
                Instant.parse("2026-09-11T05:00:00Z"),
                new OpinionMapGenerationId(new UUID(0, 10)));

        assertThat(codec.decode(codec.encode(cursor))).isEqualTo(cursor);
    }

    @Test
    void rejectsInvalidCursor() {
        assertThatThrownBy(() -> codec.decode("invalid"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Opinion Map unavailable cursor is invalid");
    }
}
