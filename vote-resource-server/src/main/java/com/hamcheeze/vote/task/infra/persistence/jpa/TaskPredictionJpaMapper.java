package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.task.Task;
import jakarta.persistence.EntityManager;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

final class TaskPredictionJpaMapper {

    private TaskPredictionJpaMapper() {
    }

    static TaskPrediction toDomain(
            EntityManager entityManager,
            TaskPredictionJpaEntity entity
    ) {
        TaskJpaEntity taskEntity = entityManager.find(
                TaskJpaEntity.class, entity.taskId());
        if (taskEntity == null) {
            throw new IllegalStateException(
                    "task disappeared while restoring prediction");
        }
        Task task = TaskJpaMapper.toDomain(entityManager, taskEntity);
        List<TaskPredictionCandidateJpaEntity> storedCandidates =
                entityManager.createQuery(
                                """
                                SELECT candidate
                                FROM TaskPredictionCandidateJpaEntity candidate
                                WHERE candidate.predictionId = :predictionId
                                ORDER BY candidate.questionId,
                                         candidate.candidateOrder,
                                         candidate.id
                                """,
                                TaskPredictionCandidateJpaEntity.class)
                        .setParameter("predictionId", entity.id())
                        .getResultList();
        List<TaskPredictionCandidateSelectionJpaEntity> storedSelections =
                entityManager.createQuery(
                                """
                                SELECT selection
                                FROM TaskPredictionCandidateSelectionJpaEntity selection
                                WHERE selection.predictionId = :predictionId
                                ORDER BY selection.candidateId, selection.optionId
                                """,
                                TaskPredictionCandidateSelectionJpaEntity.class)
                        .setParameter("predictionId", entity.id())
                        .getResultList();
        Map<UUID, List<TaskPredictionCandidateSelectionJpaEntity>>
                selectionsByCandidate = storedSelections.stream()
                .collect(Collectors.groupingBy(
                        TaskPredictionCandidateSelectionJpaEntity::candidateId));
        List<TaskPredictionCandidate> candidates = storedCandidates.stream()
                .map(candidate -> toDomain(
                        candidate,
                        selectionsByCandidate.getOrDefault(
                                candidate.id(), List.of())))
                .toList();
        TaskPredictionError lastError = entity.lastErrorCode() == null
                ? null
                : new TaskPredictionError(
                        entity.lastErrorCode(), entity.lastErrorMessage());
        return TaskPrediction.restore(
                new TaskPredictionId(entity.id()),
                new TaskUserId(entity.userId()),
                task,
                new TaskPersonaGenerationId(entity.personaGenerationId()),
                new TaskPersonaVersionId(entity.personaVersionId()),
                new TaskPersonaId(entity.personaId()),
                entity.candidatePolicyVersion(),
                entity.requestedCandidateCount(),
                entity.status(),
                entity.attemptCount(),
                candidates,
                entity.nextRetryAt(),
                lastError,
                entity.createdAt(),
                entity.startedAt(),
                entity.completedAt());
    }

    static TaskPredictionAttempt toDomain(
            TaskPredictionAttemptJpaEntity entity
    ) {
        TaskPredictionAttempt attempt = TaskPredictionAttempt.started(
                new TaskPredictionAttemptId(entity.id()),
                new TaskPredictionId(entity.predictionId()),
                entity.attemptNumber(),
                SanitizedTaskPredictionPayload.fromSanitized(
                        entity.requestPayload()),
                entity.requestedAt());
        if (!entity.outcome().completed()) {
            return attempt;
        }
        return attempt.complete(
                entity.outcome(),
                entity.httpStatus(),
                entity.responsePayload() == null
                        ? null
                        : SanitizedTaskPredictionPayload.fromSanitized(
                                entity.responsePayload()),
                entity.errorCode(),
                entity.errorMessage(),
                entity.respondedAt());
    }

    private static TaskPredictionCandidate toDomain(
            TaskPredictionCandidateJpaEntity candidate,
            List<TaskPredictionCandidateSelectionJpaEntity> selections
    ) {
        List<TaskAnswerJpaCodec.StoredSelection> storedSelections =
                selections.stream()
                        .map(selection -> new TaskAnswerJpaCodec.StoredSelection(
                                selection.optionId(),
                                selection.optionKind(),
                                selection.otherText()))
                        .toList();
        return new TaskPredictionCandidate(
                new TaskPredictionCandidateId(candidate.id()),
                new TaskPredictionId(candidate.predictionId()),
                new TaskQuestionId(candidate.questionId()),
                candidate.candidateOrder(),
                TaskAnswerJpaCodec.decode(
                        candidate.answerType(),
                        candidate.textValue(),
                        candidate.numberValue(),
                        candidate.scaleValue(),
                        storedSelections),
                candidate.rationale());
    }
}
