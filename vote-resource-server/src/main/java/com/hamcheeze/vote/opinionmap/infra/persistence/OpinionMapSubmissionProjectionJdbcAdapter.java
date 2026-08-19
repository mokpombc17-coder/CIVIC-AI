package com.hamcheeze.vote.opinionmap.infra.persistence;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class OpinionMapSubmissionProjectionJdbcAdapter
        implements OpinionMapSubmissionProjectionRepository {

    private final JdbcTemplate jdbcTemplate;

    public OpinionMapSubmissionProjectionJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    @Transactional
    public boolean insertIfAbsent(OpinionMapSubmissionProjection submission) {
        Objects.requireNonNull(submission, "submission");
        return jdbcTemplate.update("""
                INSERT INTO opinion_map_submission_projections (
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
    public Optional<OpinionMapSubmissionProjection> findBySubmissionId(
            UUID submissionId
    ) {
        Objects.requireNonNull(submissionId, "submissionId");
        return jdbcTemplate.query("""
                SELECT submission_id, user_id, task_id, prediction_id,
                       persona_generation_id, persona_version_id,
                       question_id, selected_option_id, reason_source,
                       accepted_predicted_reason_id, final_reason, submitted_at
                FROM opinion_map_submission_projections
                WHERE submission_id = ?
                """,
                (resultSet, rowNumber) -> new OpinionMapSubmissionProjection(
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
                        OpinionMapReasonSource.valueOf(
                                resultSet.getString("reason_source")),
                        resultSet.getObject(
                                "accepted_predicted_reason_id", UUID.class),
                        resultSet.getString("final_reason"),
                        resultSet.getTimestamp("submitted_at").toInstant()),
                submissionId).stream().findFirst();
    }
}
