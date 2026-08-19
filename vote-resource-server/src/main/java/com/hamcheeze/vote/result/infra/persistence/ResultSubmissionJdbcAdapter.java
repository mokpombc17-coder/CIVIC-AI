package com.hamcheeze.vote.result.infra.persistence;

import com.hamcheeze.vote.result.application.port.out.ResultSubmissionRepository;
import com.hamcheeze.vote.result.domain.ResultAnswerSelection;
import com.hamcheeze.vote.result.domain.ResultAnswerSource;
import com.hamcheeze.vote.result.domain.ResultAnswerType;
import com.hamcheeze.vote.result.domain.ResultSubmission;
import com.hamcheeze.vote.result.domain.ResultSubmissionAnswer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ResultSubmissionJdbcAdapter
        implements ResultSubmissionRepository {

    private final JdbcTemplate jdbcTemplate;

    public ResultSubmissionJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public boolean insertIfAbsent(ResultSubmission submission) {
        Objects.requireNonNull(submission, "submission");
        int inserted = jdbcTemplate.update("""
                INSERT INTO result_submissions (
                    submission_id, user_id, task_id, prediction_id,
                    persona_generation_id, persona_version_id, submitted_at,
                    submitted_answer_count, ai_accepted_answer_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (submission_id) DO NOTHING
                """,
                submission.submissionId(),
                submission.userId(),
                submission.taskId(),
                submission.predictionId(),
                submission.personaGenerationId(),
                submission.personaVersionId(),
                Timestamp.from(submission.submittedAt()),
                submission.submittedAnswerCount(),
                submission.aiAcceptedAnswerCount());
        if (inserted == 0) {
            return false;
        }
        for (ResultSubmissionAnswer answer : submission.answers()) {
            insertAnswer(submission.submissionId(), answer);
        }
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ResultSubmission> findBySubmissionId(
            UUID submissionId
    ) {
        Objects.requireNonNull(submissionId, "submissionId");
        return jdbcTemplate.query("""
                SELECT submission_id, user_id, task_id, prediction_id,
                       persona_generation_id, persona_version_id,
                       submitted_at, submitted_answer_count,
                       ai_accepted_answer_count
                FROM result_submissions
                WHERE submission_id = ?
                """,
                (resultSet, rowNumber) -> new RootRow(
                        resultSet.getObject("submission_id", UUID.class),
                        resultSet.getString("user_id"),
                        resultSet.getObject("task_id", UUID.class),
                        resultSet.getObject("prediction_id", UUID.class),
                        resultSet.getObject(
                                "persona_generation_id", UUID.class),
                        resultSet.getObject(
                                "persona_version_id", UUID.class),
                        resultSet.getTimestamp("submitted_at").toInstant(),
                        resultSet.getInt("submitted_answer_count"),
                        resultSet.getInt("ai_accepted_answer_count")),
                submissionId).stream().findFirst().map(this::loadSubmission);
    }

    private void insertAnswer(
            UUID submissionId,
            ResultSubmissionAnswer answer
    ) {
        jdbcTemplate.update("""
                INSERT INTO result_submission_answers (
                    submission_id, question_id, source,
                    adopted_prediction_candidate_id, answer_type,
                    text_value, number_value, scale_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                submissionId,
                answer.questionId(),
                answer.source().name(),
                answer.adoptedPredictionCandidateId(),
                answer.answerType().name(),
                answer.textValue(),
                answer.numberValue(),
                answer.scaleValue());
        for (ResultAnswerSelection selection : answer.selections()) {
            jdbcTemplate.update("""
                    INSERT INTO result_submission_answer_selections (
                        submission_id, question_id, answer_type,
                        option_id, other_text)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    submissionId,
                    answer.questionId(),
                    answer.answerType().name(),
                    selection.optionId(),
                    selection.otherText());
        }
    }

    private ResultSubmission loadSubmission(RootRow root) {
        List<ResultSubmissionAnswer> answers = jdbcTemplate.query("""
                SELECT question_id, source, adopted_prediction_candidate_id,
                       answer_type, text_value, number_value, scale_value
                FROM result_submission_answers
                WHERE submission_id = ?
                ORDER BY question_id
                """,
                (resultSet, rowNumber) -> new AnswerRow(
                        resultSet.getObject("question_id", UUID.class),
                        ResultAnswerSource.valueOf(
                                resultSet.getString("source")),
                        resultSet.getObject(
                                "adopted_prediction_candidate_id",
                                UUID.class),
                        ResultAnswerType.valueOf(
                                resultSet.getString("answer_type")),
                        resultSet.getString("text_value"),
                        resultSet.getBigDecimal("number_value"),
                        resultSet.getObject("scale_value", Integer.class)),
                root.submissionId()).stream()
                .map(answer -> answer.toDomain(loadSelections(
                        root.submissionId(), answer.questionId())))
                .toList();
        ResultSubmission submission = new ResultSubmission(
                root.submissionId(),
                root.userId(),
                root.taskId(),
                root.predictionId(),
                root.personaGenerationId(),
                root.personaVersionId(),
                root.submittedAt(),
                answers);
        if (submission.submittedAnswerCount()
                != root.submittedAnswerCount()
                || submission.aiAcceptedAnswerCount()
                != root.aiAcceptedAnswerCount()) {
            throw new IllegalStateException(
                    "stored result submission metrics do not match answers");
        }
        return submission;
    }

    private List<ResultAnswerSelection> loadSelections(
            UUID submissionId,
            UUID questionId
    ) {
        return jdbcTemplate.query("""
                SELECT option_id, other_text
                FROM result_submission_answer_selections
                WHERE submission_id = ? AND question_id = ?
                ORDER BY option_id
                """,
                (resultSet, rowNumber) -> new ResultAnswerSelection(
                        resultSet.getObject("option_id", UUID.class),
                        resultSet.getString("other_text")),
                submissionId,
                questionId);
    }

    private record RootRow(
            UUID submissionId,
            String userId,
            UUID taskId,
            UUID predictionId,
            UUID personaGenerationId,
            UUID personaVersionId,
            Instant submittedAt,
            int submittedAnswerCount,
            int aiAcceptedAnswerCount
    ) {
    }

    private record AnswerRow(
            UUID questionId,
            ResultAnswerSource source,
            UUID adoptedPredictionCandidateId,
            ResultAnswerType answerType,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue
    ) {

        ResultSubmissionAnswer toDomain(
                List<ResultAnswerSelection> selections
        ) {
            return new ResultSubmissionAnswer(
                    questionId,
                    answerType,
                    source,
                    adoptedPredictionCandidateId,
                    textValue,
                    numberValue,
                    scaleValue,
                    selections);
        }
    }
}
