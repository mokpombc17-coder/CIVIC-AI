package com.hamcheeze.vote.shared.integration.task;

import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2.ReasonSource;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskSubmissionCompletedV2Test {

    @Test
    void keepsImmutableSingleChoiceReasonContract() {
        TaskSubmissionCompletedV2 event = event(
                ReasonSource.AI_ACCEPTED, uuid(9), "채택 당시 예상 이유");

        assertThat(TaskSubmissionCompletedV2.EVENT_TYPE)
                .isEqualTo("task.submission-completed");
        assertThat(TaskSubmissionCompletedV2.AGGREGATE_TYPE)
                .isEqualTo("TASK_SUBMISSION");
        assertThat(TaskSubmissionCompletedV2.SCHEMA_VERSION).isEqualTo(2);
        assertThat(event.questionId()).isEqualTo(uuid(7));
        assertThat(event.selectedOptionId()).isEqualTo(uuid(8));
        assertThat(event.acceptedPredictedReasonId()).isEqualTo(uuid(9));
        assertThat(event.finalReason()).isEqualTo("채택 당시 예상 이유");
    }

    @Test
    void requiresPredictedReasonIdOnlyForAiAcceptedSource() {
        assertThatThrownBy(() -> event(
                ReasonSource.AI_ACCEPTED, null, "이유"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("requires predicted reason ID");
        assertThatThrownBy(() -> event(
                ReasonSource.USER_WRITTEN, uuid(9), "이유"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not have predicted reason ID");
    }

    @Test
    void rejectsBlankOrUntrimmedFinalReason() {
        assertThatThrownBy(() -> event(
                ReasonSource.USER_WRITTEN, null, " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> event(
                ReasonSource.USER_WRITTEN, null, " 이유 "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static TaskSubmissionCompletedV2 event(
            ReasonSource source,
            UUID acceptedReasonId,
            String finalReason
    ) {
        return new TaskSubmissionCompletedV2(
                "user-a", uuid(2), uuid(3), uuid(4), uuid(5), uuid(6),
                uuid(7), uuid(8), source, acceptedReasonId, finalReason,
                Instant.parse("2026-08-19T00:00:00Z"));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130c0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
