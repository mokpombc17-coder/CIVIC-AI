package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskSubmissionRequestHashFactoryTest {

    private final TaskSubmissionRequestHashFactory hashes =
            new TaskSubmissionRequestHashFactory();

    @Test
    void equivalentReasonLineEndingsProduceTheSameHash() {
        TaskId taskId = new TaskId(uuid(1));
        TaskOptionId optionId = new TaskOptionId(uuid(4));

        assertThat(hashes.hash(
                taskId, optionId, TaskReasonSource.USER_WRITTEN,
                null, "첫째\r\n둘째"))
                .isEqualTo(hashes.hash(
                        taskId, optionId, TaskReasonSource.USER_WRITTEN,
                        null, "첫째\n둘째"));
    }

    @Test
    void optionSourceReasonIdAndReasonBodyArePartOfTheHash() {
        TaskId taskId = new TaskId(uuid(10));
        TaskOptionId optionId = new TaskOptionId(uuid(13));
        TaskRequestHash accepted = hashes.hash(
                taskId, optionId, TaskReasonSource.AI_ACCEPTED,
                new TaskPredictedReasonId(uuid(14)), null);
        TaskRequestHash anotherReason = hashes.hash(
                taskId, optionId, TaskReasonSource.AI_ACCEPTED,
                new TaskPredictedReasonId(uuid(15)), null);
        TaskRequestHash written = hashes.hash(
                taskId, optionId, TaskReasonSource.USER_WRITTEN,
                null, "직접 작성");
        TaskRequestHash anotherOption = hashes.hash(
                taskId, new TaskOptionId(uuid(16)),
                TaskReasonSource.USER_WRITTEN, null, "직접 작성");

        assertThat(accepted).isNotEqualTo(anotherReason);
        assertThat(accepted).isNotEqualTo(written);
        assertThat(written).isNotEqualTo(anotherOption);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
