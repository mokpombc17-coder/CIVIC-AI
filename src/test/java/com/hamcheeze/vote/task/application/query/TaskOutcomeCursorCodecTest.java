package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskOutcomeCursorCodecTest {

    private final TaskOutcomeCursorCodec codec =
            new TaskOutcomeCursorCodec();

    @Test
    void roundTripsTaskBoundCursor() {
        TaskOutcomeCursor cursor = new TaskOutcomeCursor(
                new TaskId(UUID.fromString(
                        "10000000-0000-0000-0000-000000000001")),
                Instant.parse("2026-09-02T04:00:00Z"),
                new TaskSubmissionId(UUID.fromString(
                        "20000000-0000-0000-0000-000000000001")));

        assertThat(codec.decode(codec.encode(cursor))).isEqualTo(cursor);
    }

    @Test
    void rejectsMalformedCursor() {
        assertThatThrownBy(() -> codec.decode("not-a-cursor"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("task outcome cursor is invalid");
    }
}
