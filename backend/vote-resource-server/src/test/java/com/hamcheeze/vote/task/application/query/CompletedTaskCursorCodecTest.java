package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompletedTaskCursorCodecTest {

    private static final Instant CLOSED_AT =
            Instant.parse("2026-08-27T04:05:06.123456789Z");
    private static final UUID TASK_ID = UUID.fromString(
            "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7");

    private final CompletedTaskCursorCodec codec =
            new CompletedTaskCursorCodec();

    @Test
    void roundTripsStableSortKeysInAnOpaqueUrlSafeCursor() {
        CompletedTaskCursor source = new CompletedTaskCursor(
                CLOSED_AT, new TaskId(TASK_ID));

        String encoded = codec.encode(source);

        assertThat(encoded)
                .doesNotContain("=", "\n", "+", "/");
        assertThat(codec.decode(encoded)).isEqualTo(source);
        assertThat(codec.encode(source)).isEqualTo(encoded);
    }

    @Test
    void rejectsMissingOrOversizedCursor() {
        assertInvalid(null);
        assertInvalid("");
        assertInvalid("   ");
        assertInvalid("a".repeat(513));
    }

    @Test
    void rejectsMalformedBase64AndPayloadShape() {
        assertInvalid("not-a-valid-cursor!");
        assertInvalid(payload("v1", CLOSED_AT.toString()));
        assertInvalid(payload(
                "v1", CLOSED_AT.toString(), TASK_ID.toString(), "extra"));
    }

    @Test
    void rejectsUnknownVersionAndInvalidSortKeys() {
        assertInvalid(payload("v2", CLOSED_AT.toString(), TASK_ID.toString()));
        assertInvalid(payload("v1", "not-an-instant", TASK_ID.toString()));
        assertInvalid(payload("v1", CLOSED_AT.toString(), "not-a-uuid"));
        assertInvalid(payload("v1", CLOSED_AT.toString(), "1-1-1-1-1"));
    }

    @Test
    void cursorRequiresBothSortKeys() {
        assertThatThrownBy(() -> new CompletedTaskCursor(
                null, new TaskId(TASK_ID)))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("closedAt");
        assertThatThrownBy(() -> new CompletedTaskCursor(CLOSED_AT, null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("taskId");
    }

    private void assertInvalid(String encoded) {
        assertThatThrownBy(() -> codec.decode(encoded))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("completed task cursor is invalid");
    }

    private static String payload(String... fields) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(String.join("\n", fields)
                        .getBytes(StandardCharsets.UTF_8));
    }
}
