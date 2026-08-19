package com.hamcheeze.vote.result.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ResultSubmissionTest {

    @Test
    void calculatesActualAdoptionFromAllSubmittedAnswers() {
        List<ResultSubmissionAnswer> answers = new ArrayList<>(List.of(
                textAnswer(uuid(9), ResultAnswerSource.USER_ANSWERED, null),
                textAnswer(uuid(8), ResultAnswerSource.AI_ACCEPTED, uuid(20)),
                textAnswer(uuid(7), ResultAnswerSource.AI_ACCEPTED, uuid(21))));

        ResultSubmission submission = submission(answers);
        answers.clear();

        assertThat(submission.submittedAnswerCount()).isEqualTo(3);
        assertThat(submission.aiAcceptedAnswerCount()).isEqualTo(2);
        assertThat(submission.actualAdoptionRate())
                .isEqualByComparingTo(new BigDecimal("0.6667"));
        assertThat(submission.answers())
                .extracting(ResultSubmissionAnswer::questionId)
                .containsExactly(uuid(7), uuid(8), uuid(9));
        assertThatThrownBy(() -> submission.answers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsDuplicateQuestionOrInvalidAnswerShape() {
        ResultSubmissionAnswer answer = textAnswer(
                uuid(7), ResultAnswerSource.USER_ANSWERED, null);

        assertThatThrownBy(() -> submission(List.of(answer, answer)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("duplicate questionId");
        assertThatThrownBy(() -> new ResultSubmissionAnswer(
                uuid(8),
                ResultAnswerType.SINGLE_CHOICE,
                ResultAnswerSource.USER_ANSWERED,
                null,
                "not a selection",
                null,
                null,
                List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("answerType");
    }

    private static ResultSubmission submission(
            List<ResultSubmissionAnswer> answers
    ) {
        return new ResultSubmission(
                uuid(1),
                "user-a",
                uuid(2),
                uuid(3),
                uuid(4),
                uuid(5),
                Instant.parse("2026-08-19T00:00:00.123456789Z"),
                answers);
    }

    private static ResultSubmissionAnswer textAnswer(
            UUID questionId,
            ResultAnswerSource source,
            UUID candidateId
    ) {
        return new ResultSubmissionAnswer(
                questionId,
                ResultAnswerType.SHORT_TEXT,
                source,
                candidateId,
                "answer",
                null,
                null,
                List.of());
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13100000-0000-0000-0000-%012d".formatted(suffix));
    }
}
