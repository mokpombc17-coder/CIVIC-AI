package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.candidateId;
import static com.hamcheeze.vote.task.TaskTestFixtures.failedPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.optionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaGenerationId;
import static com.hamcheeze.vote.task.TaskTestFixtures.questionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.submissionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.succeededPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskSubmissionTest {

    @Test
    void acceptsPredictedReasonAndCopiesExactReasonSnapshot() {
        Task task = openTask();
        TaskPrediction prediction = succeededPrediction(task);

        TaskSubmission submission = TaskSubmission.create(
                submissionId(), userId(), task, prediction,
                personaGenerationId(),
                new AcceptTaskPredictedReason(
                        questionId(1), optionId(1), candidateId(1)),
                NOW.plusSeconds(30));

        assertThat(submission.reasonSource())
                .isEqualTo(TaskReasonSource.AI_ACCEPTED);
        assertThat(submission.selectedOptionId()).isEqualTo(optionId(1));
        assertThat(submission.acceptedPredictedReasonId())
                .isEqualTo(candidateId(1));
        assertThat(submission.finalReason())
                .isEqualTo(prediction.predictedReason(candidateId(1)).reason());
    }

    @Test
    void failedPredictionAllowsUserWrittenReasonOnly() {
        Task task = openTask();
        TaskPrediction failed = failedPrediction();

        TaskSubmission submission = TaskSubmission.create(
                submissionId(), userId(), task, failed,
                personaGenerationId(),
                written("직접 작성한 이유"), NOW.plusSeconds(30));

        assertThat(submission.reasonSource())
                .isEqualTo(TaskReasonSource.USER_WRITTEN);
        assertThat(submission.finalReason()).isEqualTo("직접 작성한 이유");
        assertThat(submission.acceptedPredictedReasonId()).isNull();

        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, failed,
                personaGenerationId(),
                new AcceptTaskPredictedReason(
                        questionId(1), optionId(1), candidateId(1)),
                NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE"));
    }

    @Test
    void rejectsReasonThatBelongsToAnotherOption() {
        Task task = openTask();
        TaskPrediction prediction = succeededPrediction(task);

        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, prediction,
                personaGenerationId(),
                new AcceptTaskPredictedReason(
                        questionId(1), optionId(2), candidateId(1)),
                NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_REASON_OPTION_MISMATCH"));
    }

    @Test
    void allowsWrittenSubmissionWhilePredictionPendingButRejectsStalePersona() {
        Task task = openTask();

        TaskSubmission written = TaskSubmission.create(
                submissionId(), userId(), task, pendingPrediction(),
                personaGenerationId(), written("이유"),
                NOW.plusSeconds(30));
        assertThat(written.reasonSource())
                .isEqualTo(TaskReasonSource.USER_WRITTEN);

        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, succeededPrediction(task),
                new TaskPersonaGenerationId(new UUID(90, 1)),
                written("이유"), NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_PREDICTION_MISMATCH"));
    }

    @Test
    void restoreKeepsStoredFinalReasonAsImmutableSnapshot() {
        Task task = openTask();
        TaskPrediction prediction = succeededPrediction(task);

        TaskSubmission restored = TaskSubmission.restore(
                submissionId(), userId(), task, prediction,
                personaGenerationId(), questionId(1),
                optionId(1), TaskReasonSource.AI_ACCEPTED, candidateId(1),
                "저장 당시 이유", NOW.plusSeconds(30));

        assertThat(restored.finalReason()).isEqualTo("저장 당시 이유");
    }

    private static WriteTaskReason written(String reason) {
        return new WriteTaskReason(questionId(1), optionId(1), reason);
    }
}
