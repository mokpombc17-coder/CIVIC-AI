package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.task.Task;
import jakarta.persistence.EntityManager;

import java.util.List;

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
        List<TaskPredictedReasonJpaEntity> storedReasons =
                entityManager.createQuery(
                                """
                                SELECT reason
                                FROM TaskPredictedReasonJpaEntity reason
                                WHERE reason.predictionId = :predictionId
                                ORDER BY reason.optionId,
                                         reason.reasonOrder,
                                         reason.id
                                """,
                                TaskPredictedReasonJpaEntity.class)
                        .setParameter("predictionId", entity.id())
                        .getResultList();
        List<TaskPredictedReason> predictedReasons = storedReasons.stream()
                .map(TaskPredictionJpaMapper::toDomain)
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
                entity.status(),
                entity.attemptCount(),
                predictedReasons,
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

    private static TaskPredictedReason toDomain(
            TaskPredictedReasonJpaEntity reason
    ) {
        return new TaskPredictedReason(
                new TaskPredictedReasonId(reason.id()),
                new TaskPredictionId(reason.predictionId()),
                new com.hamcheeze.vote.task.domain.common.TaskOptionId(
                        reason.optionId()),
                reason.reasonOrder(),
                reason.reason());
    }
}
