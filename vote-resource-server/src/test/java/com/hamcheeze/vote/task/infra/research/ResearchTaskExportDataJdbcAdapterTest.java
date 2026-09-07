package com.hamcheeze.vote.task.infra.research;

import com.hamcheeze.vote.task.application.research.ResearchTaskExportParticipant;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import org.junit.jupiter.api.Test;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ResearchTaskExportDataJdbcAdapterTest {

    @Test
    void groupsPredictionCandidatesAndAssignsExportLocalKeys()
            throws Exception {
        ResultSet resultSet = mock(ResultSet.class);
        UUID submissionId = new UUID(0, 1);
        UUID predictionId = new UUID(0, 2);
        UUID candidateOneId = new UUID(0, 3);
        UUID candidateTwoId = new UUID(0, 4);
        when(resultSet.next()).thenReturn(true, true, false);
        when(resultSet.getObject("submission_id", UUID.class))
                .thenReturn(submissionId, submissionId);
        when(resultSet.getString("user_id")).thenReturn("user-1");
        when(resultSet.getString("persona_id")).thenReturn("persona-1");
        when(resultSet.getObject("prediction_id", UUID.class))
                .thenReturn(predictionId, predictionId, predictionId);
        when(resultSet.getString("prediction_status"))
                .thenReturn(TaskPredictionStatus.SUCCEEDED.name());
        when(resultSet.getString("candidate_policy_version"))
                .thenReturn("candidate-policy/v1");
        when(resultSet.getObject(
                "accepted_predicted_reason_id", UUID.class))
                .thenReturn(candidateTwoId);
        when(resultSet.getObject("predicted_reason_id", UUID.class))
                .thenReturn(candidateOneId, candidateTwoId);
        when(resultSet.getObject("option_display_order", Integer.class))
                .thenReturn(1, 2);
        when(resultSet.getString("predicted_reason"))
                .thenReturn("첫 번째 예상", "두 번째 예상");

        List<ResearchTaskExportParticipant> participants =
                ResearchTaskExportDataJdbcAdapter.participants(resultSet);

        assertThat(participants).hasSize(1);
        ResearchTaskExportParticipant participant = participants.getFirst();
        assertThat(participant.userId()).isEqualTo("user-1");
        assertThat(participant.personaId()).isEqualTo("persona-1");
        assertThat(participant.predictionStatus())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(participant.predictionCandidates())
                .extracting(
                        candidate -> candidate.sequence(),
                        candidate -> candidate.optionDisplayOrder(),
                        candidate -> candidate.reason(),
                        candidate -> candidate.accepted())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                1, 1, "첫 번째 예상", false),
                        org.assertj.core.groups.Tuple.tuple(
                                2, 2, "두 번째 예상", true));
    }
}
