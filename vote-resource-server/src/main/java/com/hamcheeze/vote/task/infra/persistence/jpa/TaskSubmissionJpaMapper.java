package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskRequestHash;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskReceiptId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.task.Task;
import jakarta.persistence.EntityManager;

final class TaskSubmissionJpaMapper {

    private TaskSubmissionJpaMapper() {
    }

    static TaskSubmission toDomain(
            EntityManager entityManager,
            TaskSubmissionJpaEntity entity
    ) {
        TaskJpaEntity taskEntity = entityManager.find(
                TaskJpaEntity.class, entity.taskId());
        TaskPredictionJpaEntity predictionEntity = entity.predictionId() == null
                ? null
                : entityManager.find(
                        TaskPredictionJpaEntity.class, entity.predictionId());
        if (taskEntity == null
                || (entity.predictionId() != null && predictionEntity == null)) {
            throw new IllegalStateException(
                    "submission references missing task or prediction");
        }
        Task task = TaskJpaMapper.toDomain(entityManager, taskEntity);
        TaskPrediction prediction = predictionEntity == null
                ? null
                : TaskPredictionJpaMapper.toDomain(
                        entityManager, predictionEntity);
        return TaskSubmission.restore(
                new TaskSubmissionId(entity.id()),
                new TaskUserId(entity.userId()),
                task,
                prediction,
                new TaskPersonaGenerationId(entity.personaGenerationId()),
                new TaskPersonaVersionId(entity.personaVersionId()),
                new TaskQuestionId(entity.questionId()),
                new TaskOptionId(entity.selectedOptionId()),
                entity.reasonSource(),
                entity.acceptedPredictedReasonId() == null ? null
                        : new TaskPredictedReasonId(
                                entity.acceptedPredictedReasonId()),
                entity.finalReason(),
                entity.submittedAt());
    }

    static TaskSubmissionReceipt toDomain(
            TaskSubmissionReceiptJpaEntity entity
    ) {
        return TaskSubmissionReceipt.rehydrate(
                new TaskReceiptId(entity.id()),
                new TaskUserId(entity.userId()),
                new TaskIdempotencyKey(entity.idempotencyKey()),
                new TaskRequestHash(entity.requestHash()),
                entity.status(),
                entity.outcomeSchemaVersion(),
                entity.httpStatus(),
                entity.outcome(),
                entity.submissionId() == null
                        ? null : new TaskSubmissionId(entity.submissionId()),
                entity.createdAt(),
                entity.completedAt(),
                entity.expiresAt());
    }
}
