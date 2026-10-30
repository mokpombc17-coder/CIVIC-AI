package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.task.LongTextConstraint;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionConstraint;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import jakarta.persistence.EntityManager;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

final class TaskJpaMapper {

    private TaskJpaMapper() {
    }

    static Task toDomain(
            EntityManager entityManager,
            TaskJpaEntity entity
    ) {
        List<TaskQuestionJpaEntity> storedQuestions = entityManager.createQuery(
                        """
                        SELECT question
                        FROM TaskQuestionJpaEntity question
                        WHERE question.taskId = :taskId
                        ORDER BY question.displayOrder
                        """, TaskQuestionJpaEntity.class)
                .setParameter("taskId", entity.id())
                .getResultList();
        List<TaskOptionJpaEntity> storedOptions = entityManager.createQuery(
                        """
                        SELECT option
                        FROM TaskOptionJpaEntity option
                        WHERE option.taskId = :taskId
                        ORDER BY option.questionId, option.displayOrder
                        """, TaskOptionJpaEntity.class)
                .setParameter("taskId", entity.id())
                .getResultList();
        Map<UUID, List<TaskOptionJpaEntity>> optionsByQuestion =
                storedOptions.stream().collect(Collectors.groupingBy(
                        TaskOptionJpaEntity::questionId));
        List<TaskQuestion> questions = storedQuestions.stream()
                .map(question -> toDomain(
                        question,
                        optionsByQuestion.getOrDefault(
                                question.id(), List.of())))
                .toList();
        TaskSchedule schedule = schedule(
                entity.scheduledOpenAt(), entity.scheduledCloseAt());
        return Task.restore(
                new TaskId(entity.id()),
                entity.title(),
                entity.description(),
                questions,
                entity.status(),
                schedule,
                entity.publishedAt(),
                entity.openedAt(),
                entity.closedAt(),
                entity.closureType(),
                entity.createdAt(),
                entity.updatedAt());
    }

    static TaskLifecycleHistory toDomain(
            TaskLifecycleHistoryJpaEntity entity
    ) {
        return new TaskLifecycleHistory(
                new TaskLifecycleHistoryId(entity.id()),
                new TaskId(entity.taskId()),
                entity.eventType(),
                entity.previousStatus(),
                entity.newStatus(),
                schedule(entity.previousScheduledOpenAt(),
                        entity.previousScheduledCloseAt()),
                schedule(entity.newScheduledOpenAt(),
                        entity.newScheduledCloseAt()),
                entity.trigger(),
                entity.actorId() == null
                        ? null : new TaskActorId(entity.actorId()),
                entity.reason(),
                entity.closureType(),
                entity.occurredAt());
    }

    private static TaskQuestion toDomain(
            TaskQuestionJpaEntity question,
            List<TaskOptionJpaEntity> storedOptions
    ) {
        List<TaskOption> options = storedOptions.stream()
                .map(option -> new TaskOption(
                        new TaskOptionId(option.id()),
                        option.displayOrder(),
                        option.kind(),
                        option.content()))
                .toList();
        return new TaskQuestion(
                new TaskQuestionId(question.id()),
                question.displayOrder(),
                question.type(),
                question.content(),
                question.description(),
                constraint(question),
                options);
    }

    private static TaskQuestionConstraint constraint(
            TaskQuestionJpaEntity question
    ) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> new SingleChoiceConstraint();
            case MULTIPLE_CHOICE -> new MultipleChoiceConstraint(
                    question.minimumSelections(),
                    question.maximumSelections());
            case SHORT_TEXT -> new ShortTextConstraint(
                    question.textMaxLength());
            case LONG_TEXT -> new LongTextConstraint(
                    question.textMaxLength());
            case NUMBER -> new NumberConstraint(
                    question.numberMinimum(),
                    question.numberMaximum(),
                    question.decimalAllowed());
            case SCALE -> new ScaleConstraint(
                    question.scaleMinimum(),
                    question.scaleMaximum(),
                    question.scaleMinimumLabel(),
                    question.scaleMaximumLabel());
        };
    }

    private static TaskSchedule schedule(
            java.time.Instant openAt,
            java.time.Instant closeAt
    ) {
        if (openAt == null && closeAt == null) {
            return null;
        }
        if (openAt == null || closeAt == null) {
            throw new IllegalStateException("stored task schedule is incomplete");
        }
        return new TaskSchedule(openAt, closeAt);
    }
}
