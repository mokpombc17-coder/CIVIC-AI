package com.hamcheeze.vote.result.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.result.application.port.out.ResultSubmissionRepository;
import com.hamcheeze.vote.result.domain.ResultAnswerSelection;
import com.hamcheeze.vote.result.domain.ResultAnswerSource;
import com.hamcheeze.vote.result.domain.ResultAnswerType;
import com.hamcheeze.vote.result.domain.ResultSubmission;
import com.hamcheeze.vote.result.domain.ResultSubmissionAnswer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class ResultSubmissionJdbcAdapterIntegrationTest {

    @Autowired
    private ResultSubmissionRepository submissions;

    @Test
    void storesImmutableSubmissionProjectionWithTypedAnswers() {
        ResultSubmission submission = submission();

        assertThat(submissions.insertIfAbsent(submission)).isTrue();
        assertThat(submissions.insertIfAbsent(submission)).isFalse();
        assertThat(submissions.findBySubmissionId(
                submission.submissionId())).contains(submission);
    }

    private static ResultSubmission submission() {
        return new ResultSubmission(
                uuid(1),
                "user-a",
                uuid(2),
                uuid(3),
                uuid(4),
                uuid(5),
                Instant.parse("2026-08-19T00:00:00.123456789Z"),
                List.of(
                        answer(
                                10, ResultAnswerType.SINGLE_CHOICE,
                                ResultAnswerSource.AI_ACCEPTED, uuid(20),
                                null, null, null,
                                List.of(new ResultAnswerSelection(
                                        uuid(30), null))),
                        answer(
                                11, ResultAnswerType.MULTIPLE_CHOICE,
                                ResultAnswerSource.USER_ANSWERED, null,
                                null, null, null,
                                List.of(
                                        new ResultAnswerSelection(
                                                uuid(31), null),
                                        new ResultAnswerSelection(
                                                uuid(32), "other"))),
                        answer(
                                12, ResultAnswerType.SHORT_TEXT,
                                ResultAnswerSource.USER_ANSWERED, null,
                                "short", null, null, List.of()),
                        answer(
                                13, ResultAnswerType.LONG_TEXT,
                                ResultAnswerSource.USER_ANSWERED, null,
                                "long reason", null, null, List.of()),
                        answer(
                                14, ResultAnswerType.NUMBER,
                                ResultAnswerSource.USER_ANSWERED, null,
                                null, new BigDecimal("12.500000"), null,
                                List.of()),
                        answer(
                                15, ResultAnswerType.SCALE,
                                ResultAnswerSource.USER_ANSWERED, null,
                                null, null, 4, List.of())));
    }

    private static ResultSubmissionAnswer answer(
            long questionSuffix,
            ResultAnswerType type,
            ResultAnswerSource source,
            UUID candidateId,
            String text,
            BigDecimal number,
            Integer scale,
            List<ResultAnswerSelection> selections
    ) {
        return new ResultSubmissionAnswer(
                uuid(questionSuffix), type, source, candidateId,
                text, number, scale, selections);
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13110000-0000-0000-0000-%012d".formatted(suffix));
    }
}
