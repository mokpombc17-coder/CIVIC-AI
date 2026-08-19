package com.hamcheeze.vote.shared.integration.task;

import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerSource;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerType;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerV1;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.SelectionV1;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskSubmissionCompletedV1Test {

    @Test
    void definesStableV1SubmissionFactWithoutTaskContentSnapshot() {
        List<AnswerV1> answers = new ArrayList<>(List.of(
                new AnswerV1(
                        uuid(7), AnswerType.SINGLE_CHOICE,
                        AnswerSource.AI_ACCEPTED, uuid(8),
                        null, null, null,
                        List.of(new SelectionV1(uuid(9), null))),
                new AnswerV1(
                        uuid(10), AnswerType.NUMBER,
                        AnswerSource.USER_ANSWERED, null,
                        null, new BigDecimal("12.5"), null, List.of())));

        TaskSubmissionCompletedV1 event = new TaskSubmissionCompletedV1(
                "user-a", uuid(1), uuid(2), uuid(3), uuid(4), uuid(5),
                Instant.parse("2026-08-19T00:00:00Z"), answers);
        answers.clear();

        assertThat(TaskSubmissionCompletedV1.EVENT_TYPE)
                .isEqualTo("task.submission-completed");
        assertThat(TaskSubmissionCompletedV1.AGGREGATE_TYPE)
                .isEqualTo("TASK_SUBMISSION");
        assertThat(TaskSubmissionCompletedV1.SCHEMA_VERSION).isEqualTo(1);
        assertThat(event.answers()).hasSize(2);
        assertThat(event.answers().getFirst().source())
                .isEqualTo(AnswerSource.AI_ACCEPTED);
        assertThatThrownBy(() -> event.answers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsAnswerSourceOrValueShapeThatContradictsItsType() {
        assertThatThrownBy(() -> new AnswerV1(
                uuid(1), AnswerType.SHORT_TEXT,
                AnswerSource.AI_ACCEPTED, null,
                "answer", null, null, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("candidate ID");

        assertThatThrownBy(() -> new AnswerV1(
                uuid(1), AnswerType.SCALE,
                AnswerSource.USER_ANSWERED, null,
                "not-a-scale", null, null, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("answerType");
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130c0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
