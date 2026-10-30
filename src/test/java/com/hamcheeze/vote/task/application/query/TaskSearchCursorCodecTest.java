package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskSearchCursorCodecTest {

    private static final String QUERY_FINGERPRINT = "a".repeat(64);
    private static final String USER_FINGERPRINT = "b".repeat(64);
    private static final Instant SORT_AT =
            Instant.parse("2026-10-06T10:11:12.123456789Z");
    private static final UUID TASK_ID = UUID.fromString(
            "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7");

    private final TaskSearchCursorCodec codec =
            new TaskSearchCursorCodec();

    @Test
    void roundTripsIdentityAndStableSortKeys() {
        TaskSearchCursor source = new TaskSearchCursor(
                QUERY_FINGERPRINT, USER_FINGERPRINT, TaskStatus.OPEN,
                SORT_AT, new TaskId(TASK_ID));

        String encoded = codec.encode(source);

        assertThat(encoded).doesNotContain("=", "\n", "+", "/");
        assertThat(codec.decode(encoded)).isEqualTo(source);
        assertThat(codec.encode(source)).isEqualTo(encoded);
    }

    @Test
    void rejectsMalformedAndUnsupportedCursors() {
        assertInvalid(null);
        assertInvalid("");
        assertInvalid("a".repeat(1025));
        assertInvalid("not-a-valid-cursor!");
        assertInvalid(payload(
                "v2", QUERY_FINGERPRINT, USER_FINGERPRINT, "OPEN",
                SORT_AT.toString(), TASK_ID.toString()));
        assertInvalid(payload(
                "v1", "short", USER_FINGERPRINT, "OPEN",
                SORT_AT.toString(), TASK_ID.toString()));
        assertInvalid(payload(
                "v1", QUERY_FINGERPRINT, USER_FINGERPRINT, "DRAFT",
                SORT_AT.toString(), TASK_ID.toString()));
        assertInvalid(payload(
                "v1", QUERY_FINGERPRINT, USER_FINGERPRINT, "OPEN",
                "not-an-instant", TASK_ID.toString()));
    }

    private void assertInvalid(String encoded) {
        assertThatThrownBy(() -> codec.decode(encoded))
                .isInstanceOf(TaskSearchCursorException.class)
                .hasMessage("task search cursor is invalid");
    }

    private static String payload(String... fields) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(String.join("\n", fields)
                        .getBytes(StandardCharsets.UTF_8));
    }
}
