package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;
import com.hamcheeze.vote.task.domain.task.Task;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

/** Local-only submission used to expose an open participated Task. */
public final class LocalTaskParticipationFixture {

    public static final String TASK_SUBMISSION_IDEMPOTENCY_KEY =
            UUID.nameUUIDFromBytes(
                    "vote-local-task-participation-v1".getBytes(
                            StandardCharsets.UTF_8)).toString();
    public static final String REASON =
            "교통 불편을 먼저 개선하면 일상 이동의 체감 효과가 가장 크다고 생각합니다.";

    private LocalTaskParticipationFixture() {
    }

    public static WriteTaskReason answer(Task task) {
        Objects.requireNonNull(task, "task");
        if (!task.id().equals(LocalTaskFixture.TASK_ID)) {
            throw new IllegalArgumentException(
                    "local participation fixture requires the first local Task");
        }
        var question = task.questions().getFirst();
        return new WriteTaskReason(
                question.id(), question.options().getFirst().id(), REASON);
    }
}
