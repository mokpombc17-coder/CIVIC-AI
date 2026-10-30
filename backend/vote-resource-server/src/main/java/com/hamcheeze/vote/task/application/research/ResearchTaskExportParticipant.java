package com.hamcheeze.vote.task.application.research;

import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Identity and prediction data attached to one finalized Task response. */
public record ResearchTaskExportParticipant(
        TaskSubmissionId submissionId,
        String userId,
        String personaId,
        TaskPredictionStatus predictionStatus,
        String candidatePolicyVersion,
        List<PredictionCandidate> predictionCandidates
) {

    public ResearchTaskExportParticipant {
        Objects.requireNonNull(submissionId, "submissionId");
        userId = requireText(userId, "userId");
        personaId = requireText(personaId, "personaId");
        predictionCandidates = List.copyOf(Objects.requireNonNull(
                predictionCandidates, "predictionCandidates"));

        if (predictionStatus == null) {
            if (candidatePolicyVersion != null
                    || !predictionCandidates.isEmpty()) {
                throw new IllegalArgumentException(
                        "missing prediction must not have prediction data");
            }
        } else {
            candidatePolicyVersion = requireText(
                    candidatePolicyVersion, "candidatePolicyVersion");
        }

        Set<Integer> sequences = new HashSet<>();
        long acceptedCount = 0;
        for (PredictionCandidate candidate : predictionCandidates) {
            Objects.requireNonNull(candidate, "predictionCandidate");
            if (!sequences.add(candidate.sequence())) {
                throw new IllegalArgumentException(
                        "prediction candidate sequence must be unique");
            }
            if (candidate.accepted()) {
                acceptedCount++;
            }
        }
        if (acceptedCount > 1) {
            throw new IllegalArgumentException(
                    "at most one prediction candidate may be accepted");
        }
    }

    public boolean hasPrediction() {
        return predictionStatus != null;
    }

    public record PredictionCandidate(
            int sequence,
            int optionDisplayOrder,
            String reason,
            boolean accepted
    ) {

        public PredictionCandidate {
            if (sequence < 1) {
                throw new IllegalArgumentException(
                        "candidate sequence must be positive");
            }
            if (optionDisplayOrder < 1) {
                throw new IllegalArgumentException(
                        "option display order must be positive");
            }
            reason = requireText(reason, "reason");
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
