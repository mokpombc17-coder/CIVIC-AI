package com.hamcheeze.vote.task.domain.result;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskResultManifestTest {

    private static final String HASH = "a".repeat(64);
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-24T00:00:00Z");

    @Test
    void acceptsAnImmutableResultIdentityAndSummary() {
        TaskResultManifest manifest = new TaskResultManifest(
                new TaskId(UUID.randomUUID()),
                1,
                "task-result-view.v1",
                CLOSED_AT,
                500,
                HASH,
                CLOSED_AT.plusSeconds(1));

        assertThat(manifest.responseCount()).isEqualTo(500);
        assertThat(manifest.bodySha256()).isEqualTo(HASH);
    }

    @Test
    void rejectsMalformedHashAndFinalizationBeforeClosure() {
        TaskId taskId = new TaskId(UUID.randomUUID());

        assertThatThrownBy(() -> new TaskResultManifest(
                taskId, 1, "task-result-view.v1", CLOSED_AT,
                0, "ABC", CLOSED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TaskResultManifest(
                taskId, 1, "task-result-view.v1", CLOSED_AT,
                0, HASH, CLOSED_AT.minusSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
