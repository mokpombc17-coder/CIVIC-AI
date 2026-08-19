package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.candidateId;
import static com.hamcheeze.vote.task.TaskTestFixtures.failedPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.optionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaGenerationId;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaVersionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.questionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.submissionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.succeededPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskSubmissionTest {

    @Test
    void acceptsAiCandidateAndCopiesExactCandidateSnapshot() {
        Task task = openTask();
        TaskPrediction prediction = succeededPrediction(task);

        TaskSubmission submission = TaskSubmission.create(
                submissionId(), userId(), task, prediction,
                personaGenerationId(), personaVersionId(),
                List.of(new AcceptTaskPredictionCandidate(
                        questionId(1), candidateId(1))),
                NOW.plusSeconds(30));

        assertThat(submission.personaVersionId())
                .isEqualTo(personaVersionId());
        assertThat(submission.answers())
                .extracting(TaskSubmissionAnswer::source)
                .containsExactly(TaskAnswerSource.AI_ACCEPTED);
        assertThat(submission.answers().getFirst().finalAnswerValue())
                .isEqualTo(new com.hamcheeze.vote.task.domain.answer
                        .SingleChoiceValue(
                        new com.hamcheeze.vote.task.domain.answer
                                .TaskOptionSelection(
                                prediction.predictedReason(candidateId(1))
                                        .optionId(),
                                null)));
        assertThatThrownBy(() -> submission.answers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void failedPredictionAllowsOnlyCompleteDirectAnswers() {
        Task task = openTask();
        TaskPrediction failed = failedPrediction();

        TaskSubmission submission = TaskSubmission.create(
                submissionId(), userId(), task, failed,
                personaGenerationId(), personaVersionId(), directAnswers(),
                NOW.plusSeconds(30));

        assertThat(submission.answers())
                .allMatch(answer ->
                        answer.source() == TaskAnswerSource.USER_ANSWERED);
        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, failed,
                personaGenerationId(), personaVersionId(),
                List.of(new AcceptTaskPredictionCandidate(
                        questionId(1), candidateId(1))),
                NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE"));
    }

    @Test
    void rejectsMissingDuplicatePendingAndStalePersonaSubmission() {
        Task task = openTask();
        TaskPrediction succeeded = succeededPrediction(task);
        List<TaskSubmissionAnswerCommand> missing = List.of();

        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, succeeded,
                personaGenerationId(), personaVersionId(), missing,
                NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_ANSWER_SET_INCOMPLETE"));

        List<TaskSubmissionAnswerCommand> duplicate = List.of(
                directAnswers().getFirst(), directAnswers().getFirst());
        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, succeeded,
                personaGenerationId(), personaVersionId(), duplicate,
                NOW.plusSeconds(30)))
                .isInstanceOf(TaskDomainException.class);

        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, pendingPrediction(),
                personaGenerationId(), personaVersionId(), directAnswers(),
                NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_PREDICTION_NOT_READY"));

        assertThatThrownBy(() -> TaskSubmission.create(
                submissionId(), userId(), task, succeeded,
                new TaskPersonaGenerationId(new UUID(90, 1)),
                personaVersionId(),
                directAnswers(), NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_SUBMISSION_PREDICTION_MISMATCH"));
    }

    @Test
    void directChoiceIsPreservedAsUserAnswered() {
        Task task = openTask();
        TaskPrediction prediction = succeededPrediction(task);
        List<TaskSubmissionAnswerCommand> answers = List.of(
                new UserAnsweredTaskQuestion(
                        questionId(1),
                        new SingleChoiceValue(
                                new TaskOptionSelection(optionId(2), null))));

        TaskSubmission submission = TaskSubmission.create(
                submissionId(), userId(), task, prediction,
                personaGenerationId(), personaVersionId(), answers,
                NOW.plusSeconds(30));

        assertThat(submission.answers().getFirst().source())
                .isEqualTo(TaskAnswerSource.USER_ANSWERED);
        assertThat(submission.answers().getFirst()
                .adoptedPredictionCandidateId()).isNull();
    }

    @Test
    void restoreRejectsChangedAiSnapshot() {
        Task task = openTask();
        TaskPrediction prediction = succeededPrediction(task);
        List<TaskSubmissionAnswer> corrupted = List.of(
                TaskSubmissionAnswer.aiAccepted(
                        questionId(1), candidateId(1),
                        new SingleChoiceValue(
                                new TaskOptionSelection(optionId(2), null))));

        assertThatThrownBy(() -> TaskSubmission.restore(
                submissionId(), userId(), task, prediction,
                personaGenerationId(), personaVersionId(), corrupted,
                NOW.plusSeconds(30)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo("TASK_SUBMISSION_AI_ANSWER_CHANGED"));
    }

    private static List<TaskSubmissionAnswerCommand> directAnswers() {
        return List.of(
                new UserAnsweredTaskQuestion(
                        questionId(1),
                        new SingleChoiceValue(
                                new TaskOptionSelection(optionId(1), null))));
    }
}
