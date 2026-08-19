package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskRequestHash;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskReceiptId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswer;
import com.hamcheeze.vote.task.domain.task.Task;
import jakarta.persistence.EntityManager;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

final class TaskSubmissionJpaMapper {

    private TaskSubmissionJpaMapper() {
    }

    static TaskSubmission toDomain(
            EntityManager entityManager,
            TaskSubmissionJpaEntity entity
    ) {
        TaskJpaEntity taskEntity = entityManager.find(
                TaskJpaEntity.class, entity.taskId());
        TaskPredictionJpaEntity predictionEntity = entityManager.find(
                TaskPredictionJpaEntity.class, entity.predictionId());
        if (taskEntity == null || predictionEntity == null) {
            throw new IllegalStateException(
                    "submission references missing task or prediction");
        }
        Task task = TaskJpaMapper.toDomain(entityManager, taskEntity);
        TaskPrediction prediction = TaskPredictionJpaMapper.toDomain(
                entityManager, predictionEntity);
        List<TaskSubmissionAnswerJpaEntity> storedAnswers =
                entityManager.createQuery(
                                """
                                SELECT answer
                                FROM TaskSubmissionAnswerJpaEntity answer
                                WHERE answer.submissionId = :submissionId
                                ORDER BY answer.questionId
                                """, TaskSubmissionAnswerJpaEntity.class)
                        .setParameter("submissionId", entity.id())
                        .getResultList();
        List<TaskSubmissionAnswerSelectionJpaEntity> storedSelections =
                entityManager.createQuery(
                                """
                                SELECT selection
                                FROM TaskSubmissionAnswerSelectionJpaEntity selection
                                WHERE selection.submissionId = :submissionId
                                ORDER BY selection.questionId, selection.optionId
                                """,
                                TaskSubmissionAnswerSelectionJpaEntity.class)
                        .setParameter("submissionId", entity.id())
                        .getResultList();
        Map<UUID, List<TaskSubmissionAnswerSelectionJpaEntity>>
                selectionsByQuestion = storedSelections.stream()
                .collect(Collectors.groupingBy(
                        TaskSubmissionAnswerSelectionJpaEntity::questionId));
        List<TaskSubmissionAnswer> answers = storedAnswers.stream()
                .map(answer -> toDomain(
                        answer,
                        selectionsByQuestion.getOrDefault(
                                answer.questionId(), List.of())))
                .toList();
        return TaskSubmission.restore(
                new TaskSubmissionId(entity.id()),
                new TaskUserId(entity.userId()),
                task,
                prediction,
                new TaskPersonaGenerationId(entity.personaGenerationId()),
                new TaskPersonaVersionId(entity.personaVersionId()),
                answers,
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

    private static TaskSubmissionAnswer toDomain(
            TaskSubmissionAnswerJpaEntity answer,
            List<TaskSubmissionAnswerSelectionJpaEntity> selections
    ) {
        List<TaskAnswerJpaCodec.StoredSelection> storedSelections =
                selections.stream()
                        .map(selection -> new TaskAnswerJpaCodec.StoredSelection(
                                selection.optionId(),
                                selection.optionKind(),
                                selection.otherText()))
                        .toList();
        return new TaskSubmissionAnswer(
                new com.hamcheeze.vote.task.domain.common.TaskQuestionId(
                        answer.questionId()),
                answer.source(),
                answer.adoptedCandidateId() == null
                        ? null
                        : new TaskPredictionCandidateId(
                                answer.adoptedCandidateId()),
                TaskAnswerJpaCodec.decode(
                        answer.answerType(),
                        answer.textValue(),
                        answer.numberValue(),
                        answer.scaleValue(),
                        storedSelections));
    }
}
