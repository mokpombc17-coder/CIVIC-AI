package com.hamcheeze.vote.result.infra.persistence;

import com.hamcheeze.vote.result.application.port.out.ResultSubmissionRepository;
import com.hamcheeze.vote.result.domain.ResultReasonSource;
import com.hamcheeze.vote.result.domain.ResultSubmission;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
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
        return jdbcTemplate.update("""
                INSERT INTO result_submissions (
                    submission_id, user_id, task_id, prediction_id,
                    persona_generation_id, persona_version_id,
                    question_id, selected_option_id, reason_source,
                    accepted_predicted_reason_id, final_reason, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (submission_id) DO NOTHING
                """,
                submission.submissionId(),
                submission.userId(),
                submission.taskId(),
                submission.predictionId(),
                submission.personaGenerationId(),
                submission.personaVersionId(),
                submission.questionId(),
                submission.selectedOptionId(),
                submission.reasonSource().name(),
                submission.acceptedPredictedReasonId(),
                submission.finalReason(),
                Timestamp.from(submission.submittedAt())) == 1;
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
                       question_id, selected_option_id, reason_source,
                       accepted_predicted_reason_id, final_reason, submitted_at
                FROM result_submissions
                WHERE submission_id = ?
                """,
                (resultSet, rowNumber) -> new ResultSubmission(
                        resultSet.getObject("submission_id", UUID.class),
                        resultSet.getString("user_id"),
                        resultSet.getObject("task_id", UUID.class),
                        resultSet.getObject("prediction_id", UUID.class),
                        resultSet.getObject(
                                "persona_generation_id", UUID.class),
                        resultSet.getObject(
                                "persona_version_id", UUID.class),
                        resultSet.getObject("question_id", UUID.class),
                        resultSet.getObject("selected_option_id", UUID.class),
                        ResultReasonSource.valueOf(
                                resultSet.getString("reason_source")),
                        resultSet.getObject(
                                "accepted_predicted_reason_id", UUID.class),
                        resultSet.getString("final_reason"),
                        resultSet.getTimestamp("submitted_at").toInstant()),
                submissionId).stream().findFirst();
    }
}
