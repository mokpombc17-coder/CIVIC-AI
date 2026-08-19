package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictedReason;
import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskSubmissionRequestHashFactoryTest {

    private final TaskSubmissionRequestHashFactory hashes =
            new TaskSubmissionRequestHashFactory();

    @Test
    void equivalentReasonLineEndingsProduceTheSameHash() {
        TaskId taskId = new TaskId(uuid(1));
        TaskPredictionId predictionId = new TaskPredictionId(uuid(2));
        TaskQuestionId questionId = new TaskQuestionId(uuid(3));
        TaskOptionId optionId = new TaskOptionId(uuid(4));

        assertThat(hashes.hash(
                taskId, predictionId,
                new WriteTaskReason(
                        questionId, optionId, "첫째\r\n둘째")))
                .isEqualTo(hashes.hash(
                        taskId, predictionId,
                        new WriteTaskReason(
                                questionId, optionId, "첫째\n둘째")));
    }

    @Test
    void optionSourceReasonIdAndReasonBodyArePartOfTheHash() {
        TaskId taskId = new TaskId(uuid(10));
        TaskPredictionId predictionId = new TaskPredictionId(uuid(11));
        TaskQuestionId questionId = new TaskQuestionId(uuid(12));
        TaskOptionId optionId = new TaskOptionId(uuid(13));
        TaskRequestHash accepted = hashes.hash(
                taskId, predictionId,
                new AcceptTaskPredictedReason(
                        questionId, optionId,
                        new TaskPredictedReasonId(uuid(14))));
        TaskRequestHash anotherReason = hashes.hash(
                taskId, predictionId,
                new AcceptTaskPredictedReason(
                        questionId, optionId,
                        new TaskPredictedReasonId(uuid(15))));
        TaskRequestHash written = hashes.hash(
                taskId, predictionId,
                new WriteTaskReason(questionId, optionId, "직접 작성"));
        TaskRequestHash anotherOption = hashes.hash(
                taskId, predictionId,
                new WriteTaskReason(
                        questionId, new TaskOptionId(uuid(16)), "직접 작성"));

        assertThat(accepted).isNotEqualTo(anotherReason);
        assertThat(accepted).isNotEqualTo(written);
        assertThat(written).isNotEqualTo(anotherOption);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
