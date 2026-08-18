package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
import com.hamcheeze.vote.task.domain.submission.UserAnsweredTaskQuestion;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskSubmissionRequestHashFactoryTest {

    private final TaskSubmissionRequestHashFactory hashes =
            new TaskSubmissionRequestHashFactory();

    @Test
    void equivalentOrderingTextAndNumbersProduceTheSameHash() {
        TaskId taskId = new TaskId(uuid(1));
        TaskPredictionId predictionId = new TaskPredictionId(uuid(2));
        TaskQuestionId choiceQuestion = new TaskQuestionId(uuid(3));
        TaskQuestionId textQuestion = new TaskQuestionId(uuid(4));
        TaskQuestionId numberQuestion = new TaskQuestionId(uuid(5));
        TaskOptionSelection first = new TaskOptionSelection(
                new TaskOptionId(uuid(6)), null);
        TaskOptionSelection second = new TaskOptionSelection(
                new TaskOptionId(uuid(7)), "  직접\r\n입력  ");
        List<TaskSubmissionAnswerCommand> original = List.of(
                new UserAnsweredTaskQuestion(
                        choiceQuestion,
                        new MultipleChoiceValue(List.of(first, second))),
                new UserAnsweredTaskQuestion(
                        textQuestion,
                        new ShortTextValue("  첫째\r\n둘째  ")),
                new UserAnsweredTaskQuestion(
                        numberQuestion,
                        new NumberValue(new BigDecimal("1.00"))));
        List<TaskSubmissionAnswerCommand> equivalent = List.of(
                new UserAnsweredTaskQuestion(
                        numberQuestion,
                        new NumberValue(new BigDecimal("1"))),
                new UserAnsweredTaskQuestion(
                        textQuestion,
                        new ShortTextValue("첫째\n둘째")),
                new UserAnsweredTaskQuestion(
                        choiceQuestion,
                        new MultipleChoiceValue(List.of(
                                new TaskOptionSelection(
                                        second.optionId(), "직접\n입력"),
                                first))));

        assertThat(hashes.hash(taskId, predictionId, original))
                .isEqualTo(hashes.hash(taskId, predictionId, equivalent));
    }

    @Test
    void answerSourceCandidateAndBodyArePartOfTheHash() {
        TaskId taskId = new TaskId(uuid(10));
        TaskPredictionId predictionId = new TaskPredictionId(uuid(11));
        TaskQuestionId questionId = new TaskQuestionId(uuid(12));
        TaskRequestHash accepted = hashes.hash(
                taskId,
                predictionId,
                List.of(new AcceptTaskPredictionCandidate(
                        questionId,
                        new TaskPredictionCandidateId(uuid(13)))));
        TaskRequestHash anotherCandidate = hashes.hash(
                taskId,
                predictionId,
                List.of(new AcceptTaskPredictionCandidate(
                        questionId,
                        new TaskPredictionCandidateId(uuid(14)))));
        TaskRequestHash direct = hashes.hash(
                taskId,
                predictionId,
                List.of(new UserAnsweredTaskQuestion(
                        questionId, new ShortTextValue("answer"))));

        assertThat(accepted).isNotEqualTo(anotherCandidate);
        assertThat(accepted).isNotEqualTo(direct);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
