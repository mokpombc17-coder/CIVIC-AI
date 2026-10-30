package com.hamcheeze.vote.task.infra.research;

import com.hamcheeze.vote.task.application.research.ResearchTaskExportDataReader;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportParticipant;
import com.hamcheeze.vote.task.application.research.ResearchTaskExportParticipant.PredictionCandidate;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Repository
public class ResearchTaskExportDataJdbcAdapter
        implements ResearchTaskExportDataReader {

    private static final String SQL = """
            SELECT submission.submission_id,
                   submission.user_id,
                   generation.persona_id,
                   prediction.prediction_id,
                   prediction.status AS prediction_status,
                   prediction.candidate_policy_version,
                   submission.accepted_predicted_reason_id,
                   reason.predicted_reason_id,
                   reason.reason_order,
                   task_option.display_order AS option_display_order,
                   reason.reason AS predicted_reason
              FROM task_submissions submission
              JOIN persona_generations generation
                ON generation.generation_id =
                   submission.persona_generation_id
              LEFT JOIN task_predictions prediction
                ON prediction.user_id = submission.user_id
               AND prediction.task_id = submission.task_id
               AND prediction.persona_generation_id =
                   submission.persona_generation_id
              LEFT JOIN task_predicted_reasons reason
                ON reason.prediction_id = prediction.prediction_id
              LEFT JOIN task_options task_option
                ON task_option.option_id = reason.option_id
               AND task_option.task_id = submission.task_id
             WHERE submission.task_id = ?
             ORDER BY submission.submission_id,
                      task_option.display_order,
                      reason.reason_order,
                      reason.predicted_reason_id
            """;

    private final JdbcTemplate jdbcTemplate;

    public ResearchTaskExportDataJdbcAdapter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
    }

    @Override
    public List<ResearchTaskExportParticipant> findParticipants(
            TaskId taskId
    ) {
        Objects.requireNonNull(taskId, "taskId");
        return jdbcTemplate.query(
                SQL,
                statement -> statement.setObject(1, taskId.value()),
                (ResultSetExtractor<List<ResearchTaskExportParticipant>>)
                        ResearchTaskExportDataJdbcAdapter::participants);
    }

    static List<ResearchTaskExportParticipant> participants(
            ResultSet resultSet
    ) throws SQLException {
        Map<UUID, MutableParticipant> participants = new LinkedHashMap<>();
        while (resultSet.next()) {
            UUID submissionId = uuid(resultSet, "submission_id");
            MutableParticipant participant = participants.computeIfAbsent(
                    submissionId,
                    ignored -> participant(resultSet, submissionId));
            participant.requireSamePrediction(resultSet);
            UUID candidateId = nullableUuid(
                    resultSet, "predicted_reason_id");
            if (candidateId != null) {
                participant.addCandidate(resultSet, candidateId);
            }
        }
        return participants.values().stream()
                .map(MutableParticipant::toImmutable)
                .toList();
    }

    private static MutableParticipant participant(
            ResultSet resultSet,
            UUID submissionId
    ) {
        try {
            String predictionStatus = resultSet.getString(
                    "prediction_status");
            return new MutableParticipant(
                    submissionId,
                    resultSet.getString("user_id"),
                    resultSet.getString("persona_id"),
                    nullableUuid(resultSet, "prediction_id"),
                    predictionStatus == null ? null
                            : TaskPredictionStatus.valueOf(
                            predictionStatus),
                    resultSet.getString("candidate_policy_version"),
                    nullableUuid(
                            resultSet, "accepted_predicted_reason_id"));
        } catch (SQLException exception) {
            throw new IllegalStateException(
                    "failed to read research Task participant", exception);
        }
    }

    private static UUID uuid(ResultSet resultSet, String column)
            throws SQLException {
        return Objects.requireNonNull(
                nullableUuid(resultSet, column), column);
    }

    private static UUID nullableUuid(ResultSet resultSet, String column)
            throws SQLException {
        return resultSet.getObject(column, UUID.class);
    }

    private static final class MutableParticipant {

        private final UUID submissionId;
        private final String userId;
        private final String personaId;
        private final UUID predictionId;
        private final TaskPredictionStatus predictionStatus;
        private final String candidatePolicyVersion;
        private final UUID acceptedCandidateId;
        private final List<PredictionCandidate> candidates =
                new ArrayList<>();

        private MutableParticipant(
                UUID submissionId,
                String userId,
                String personaId,
                UUID predictionId,
                TaskPredictionStatus predictionStatus,
                String candidatePolicyVersion,
                UUID acceptedCandidateId
        ) {
            this.submissionId = submissionId;
            this.userId = userId;
            this.personaId = personaId;
            this.predictionId = predictionId;
            this.predictionStatus = predictionStatus;
            this.candidatePolicyVersion = candidatePolicyVersion;
            this.acceptedCandidateId = acceptedCandidateId;
        }

        private void requireSamePrediction(ResultSet resultSet)
                throws SQLException {
            if (!Objects.equals(predictionId,
                    nullableUuid(resultSet, "prediction_id"))) {
                throw new IllegalStateException(
                        "submission matched multiple Task predictions");
            }
        }

        private void addCandidate(
                ResultSet resultSet,
                UUID candidateId
        ) throws SQLException {
            Integer optionDisplayOrder = resultSet.getObject(
                    "option_display_order", Integer.class);
            candidates.add(new PredictionCandidate(
                    candidates.size() + 1,
                    Objects.requireNonNull(
                            optionDisplayOrder, "option_display_order"),
                    resultSet.getString("predicted_reason"),
                    candidateId.equals(acceptedCandidateId)));
        }

        private ResearchTaskExportParticipant toImmutable() {
            return new ResearchTaskExportParticipant(
                    new TaskSubmissionId(submissionId),
                    userId,
                    personaId,
                    predictionStatus,
                    candidatePolicyVersion,
                    candidates);
        }
    }
}
