package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ParticipatedTaskCursorCodecTest {

    private static final String QUERY_FINGERPRINT = "a".repeat(64);
    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-27T04:05:06.123456789Z");
    private static final UUID TASK_ID = UUID.fromString(
            "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7");

    private final ParticipatedTaskCursorCodec codec =
            new ParticipatedTaskCursorCodec();

    @Test
    void roundTripsQueryAndStableSortKeysInOpaqueCursor() {
        ParticipatedTaskCursor source = new ParticipatedTaskCursor(
                QUERY_FINGERPRINT, SUBMITTED_AT, new TaskId(TASK_ID));

        String encoded = codec.encode(source);

        assertThat(encoded).doesNotContain("=", "\n", "+", "/");
        assertThat(codec.decode(encoded)).isEqualTo(source);
        assertThat(codec.encode(source)).isEqualTo(encoded);
    }

    @Test
    void rejectsMalformedCursorAndSortKeys() {
        assertInvalid(null);
        assertInvalid("");
        assertInvalid("a".repeat(513));
        assertInvalid("not-a-valid-cursor!");
        assertInvalid(payload(
                "v2", QUERY_FINGERPRINT,
                SUBMITTED_AT.toString(), TASK_ID.toString()));
        assertInvalid(payload(
                "v1", "short", SUBMITTED_AT.toString(), TASK_ID.toString()));
        assertInvalid(payload(
                "v1", QUERY_FINGERPRINT,
                "not-an-instant", TASK_ID.toString()));
        assertInvalid(payload(
                "v1", QUERY_FINGERPRINT,
                SUBMITTED_AT.toString(), "not-a-uuid"));
    }

    @Test
    void cursorRequiresQueryFingerprintAndBothSortKeys() {
        assertThatThrownBy(() -> new ParticipatedTaskCursor(
                null, SUBMITTED_AT, new TaskId(TASK_ID)))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("queryFingerprint");
        assertThatThrownBy(() -> new ParticipatedTaskCursor(
                "short", SUBMITTED_AT, new TaskId(TASK_ID)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SHA-256");
        assertThatThrownBy(() -> new ParticipatedTaskCursor(
                QUERY_FINGERPRINT, null, new TaskId(TASK_ID)))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("submittedAt");
        assertThatThrownBy(() -> new ParticipatedTaskCursor(
                QUERY_FINGERPRINT, SUBMITTED_AT, null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("taskId");
    }

    private void assertInvalid(String encoded) {
        assertThatThrownBy(() -> codec.decode(encoded))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("participated task cursor is invalid");
    }

    private static String payload(String... fields) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(String.join("\n", fields)
                        .getBytes(StandardCharsets.UTF_8));
    }
}
