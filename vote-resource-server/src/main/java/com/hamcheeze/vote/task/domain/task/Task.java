package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskText;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.common.TaskViolation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

public final class Task {

    private final TaskId id;
    private String title;
    private String description;
    private List<TaskQuestion> questions;
    private TaskStatus status;
    private TaskSchedule schedule;
    private Instant publishedAt;
    private Instant openedAt;
    private Instant closedAt;
    private TaskClosureType closureType;
    private final Instant createdAt;
    private Instant updatedAt;

    private Task(
            TaskId id,
            String title,
            String description,
            List<TaskQuestion> questions,
            TaskStatus status,
            TaskSchedule schedule,
            Instant publishedAt,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.title = normalizeTitle(title);
        this.description = normalizeDescription(description);
        this.questions = normalizeQuestions(questions);
        this.status = Objects.requireNonNull(status, "status");
        this.schedule = schedule;
        this.publishedAt = publishedAt;
        this.openedAt = openedAt;
        this.closedAt = closedAt;
        this.closureType = closureType;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        validateConsistency();
    }

    public static Task draft(
            TaskId id,
            String title,
            String description,
            List<TaskQuestion> questions,
            Instant createdAt
    ) {
        Objects.requireNonNull(createdAt, "createdAt");
        return new Task(
                id, title, description, questions,
                TaskStatus.DRAFT, null, null, null, null, null,
                createdAt, createdAt);
    }

    public static Task restore(
            TaskId id,
            String title,
            String description,
            List<TaskQuestion> questions,
            TaskStatus status,
            TaskSchedule schedule,
            Instant publishedAt,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            Instant createdAt,
            Instant updatedAt
    ) {
        return new Task(
                id, title, description, questions, status, schedule,
                publishedAt, openedAt, closedAt, closureType,
                createdAt, updatedAt);
    }

    public void replaceContent(
            String title,
            String description,
            List<TaskQuestion> questions,
            Instant changedAt
    ) {
        requireStatus(TaskStatus.DRAFT, "replace content");
        requireMonotonic(changedAt);
        this.title = normalizeTitle(title);
        this.description = normalizeDescription(description);
        this.questions = normalizeQuestions(questions);
        this.updatedAt = changedAt;
    }

    public TaskLifecycleHistory schedule(
            TaskLifecycleHistoryId historyId,
            TaskSchedule newSchedule,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.DRAFT, "schedule");
        requireMonotonic(occurredAt);
        validatePublishable();
        requireFutureSchedule(newSchedule, occurredAt);
        TaskStatus previous = status;
        status = TaskStatus.SCHEDULED;
        schedule = newSchedule;
        publishedAt = occurredAt;
        updatedAt = occurredAt;
        return history(
                historyId, TaskLifecycleEventType.SCHEDULED,
                previous, status, null, schedule,
                TaskLifecycleTrigger.ADMIN, actorId, reason, null, occurredAt);
    }

    public TaskLifecycleHistory openImmediately(
            TaskLifecycleHistoryId historyId,
            Instant scheduledCloseAt,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.DRAFT, "open immediately");
        requireMonotonic(occurredAt);
        validatePublishable();
        TaskSchedule newSchedule = new TaskSchedule(
                occurredAt, Objects.requireNonNull(
                        scheduledCloseAt, "scheduledCloseAt"));
        TaskStatus previous = status;
        status = TaskStatus.OPEN;
        schedule = newSchedule;
        publishedAt = occurredAt;
        openedAt = occurredAt;
        updatedAt = occurredAt;
        return history(
                historyId, TaskLifecycleEventType.OPENED,
                previous, status, null, schedule,
                TaskLifecycleTrigger.ADMIN, actorId, reason, null, occurredAt);
    }

    public TaskLifecycleHistory reschedule(
            TaskLifecycleHistoryId historyId,
            TaskSchedule newSchedule,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.SCHEDULED, "reschedule");
        requireMonotonic(occurredAt);
        requireFutureSchedule(newSchedule, occurredAt);
        TaskSchedule previousSchedule = schedule;
        schedule = newSchedule;
        updatedAt = occurredAt;
        return history(
                historyId, TaskLifecycleEventType.RESCHEDULED,
                status, status, previousSchedule, schedule,
                TaskLifecycleTrigger.ADMIN, actorId, reason, null, occurredAt);
    }

    public TaskLifecycleHistory openScheduled(
            TaskLifecycleHistoryId historyId,
            TaskLifecycleTrigger trigger,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.SCHEDULED, "open scheduled task");
        requireMonotonic(occurredAt);
        if (!occurredAt.isBefore(schedule.scheduledCloseAt())) {
            throw TaskDomainException.invariant(
                    "TASK_OPEN_AFTER_DEADLINE_NOT_ALLOWED",
                    "occurredAt",
                    "task must not open at or after its deadline");
        }
        if (trigger == TaskLifecycleTrigger.SYSTEM
                && occurredAt.isBefore(schedule.scheduledOpenAt())) {
            throw TaskDomainException.invariant(
                    "TASK_OPEN_BEFORE_SCHEDULE_NOT_ALLOWED",
                    "occurredAt",
                    "system must not open task before scheduledOpenAt");
        }
        TaskSchedule previousSchedule = schedule;
        if (occurredAt.isBefore(schedule.scheduledOpenAt())) {
            schedule = new TaskSchedule(
                    occurredAt, schedule.scheduledCloseAt());
        }
        TaskStatus previous = status;
        status = TaskStatus.OPEN;
        openedAt = occurredAt;
        updatedAt = occurredAt;
        return history(
                historyId, TaskLifecycleEventType.OPENED,
                previous, status, previousSchedule, schedule,
                trigger, actorId, reason, null, occurredAt);
    }

    public TaskLifecycleHistory changeDeadline(
            TaskLifecycleHistoryId historyId,
            Instant newCloseAt,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.OPEN, "change deadline");
        requireMonotonic(occurredAt);
        Objects.requireNonNull(newCloseAt, "newCloseAt");
        if (!occurredAt.isBefore(newCloseAt)) {
            throw TaskDomainException.invariant(
                    "TASK_DEADLINE_MUST_BE_FUTURE",
                    "newCloseAt",
                    "changed deadline must be in the future");
        }
        TaskSchedule previousSchedule = schedule;
        schedule = new TaskSchedule(schedule.scheduledOpenAt(), newCloseAt);
        updatedAt = occurredAt;
        return history(
                historyId, TaskLifecycleEventType.RESCHEDULED,
                status, status, previousSchedule, schedule,
                TaskLifecycleTrigger.ADMIN, actorId, reason, null, occurredAt);
    }

    public TaskLifecycleHistory closeAtDeadline(
            TaskLifecycleHistoryId historyId,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.OPEN, "close at deadline");
        requireMonotonic(occurredAt);
        if (occurredAt.isBefore(schedule.scheduledCloseAt())) {
            throw TaskDomainException.invariant(
                    "TASK_DEADLINE_NOT_REACHED",
                    "occurredAt",
                    "scheduledCloseAt has not been reached");
        }
        return close(
                historyId,
                TaskClosureType.DEADLINE_REACHED,
                TaskLifecycleTrigger.SYSTEM,
                null,
                null,
                occurredAt);
    }

    public TaskLifecycleHistory closeEarly(
            TaskLifecycleHistoryId historyId,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.OPEN, "close early");
        requireMonotonic(occurredAt);
        if (!occurredAt.isBefore(schedule.scheduledCloseAt())) {
            throw TaskDomainException.invariant(
                    "TASK_EARLY_CLOSE_AFTER_DEADLINE",
                    "occurredAt",
                    "early close must occur before scheduledCloseAt");
        }
        return close(
                historyId,
                TaskClosureType.EARLY_CLOSED,
                TaskLifecycleTrigger.ADMIN,
                actorId,
                reason,
                occurredAt);
    }

    public TaskLifecycleHistory cancel(
            TaskLifecycleHistoryId historyId,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        if (status == TaskStatus.CLOSED) {
            throw transitionNotAllowed("cancel");
        }
        requireMonotonic(occurredAt);
        return close(
                historyId,
                TaskClosureType.CANCELLED,
                TaskLifecycleTrigger.ADMIN,
                actorId,
                reason,
                occurredAt);
    }

    public TaskLifecycleHistory missSchedule(
            TaskLifecycleHistoryId historyId,
            Instant occurredAt
    ) {
        requireStatus(TaskStatus.SCHEDULED, "miss schedule");
        requireMonotonic(occurredAt);
        if (occurredAt.isBefore(schedule.scheduledCloseAt())) {
            throw TaskDomainException.invariant(
                    "TASK_SCHEDULE_WINDOW_NOT_MISSED",
                    "occurredAt",
                    "schedule window has not been fully missed");
        }
        return close(
                historyId,
                TaskClosureType.MISSED_SCHEDULE,
                TaskLifecycleTrigger.SYSTEM,
                null,
                null,
                occurredAt);
    }

    public boolean isOpenAt(Instant instant) {
        Objects.requireNonNull(instant, "instant");
        return status == TaskStatus.OPEN && schedule.contains(instant);
    }

    public boolean resultEligible() {
        return status == TaskStatus.CLOSED
                && closureType != null
                && closureType.resultEligible();
    }

    public TaskQuestion question(TaskQuestionId questionId) {
        Objects.requireNonNull(questionId, "questionId");
        return questions.stream()
                .filter(question -> question.id().equals(questionId))
                .findFirst()
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_QUESTION_NOT_FOUND",
                        "questionId",
                        "question does not belong to task"));
    }

    public TaskId id() {
        return id;
    }

    public String title() {
        return title;
    }

    public String description() {
        return description;
    }

    public List<TaskQuestion> questions() {
        return questions;
    }

    public TaskStatus status() {
        return status;
    }

    public TaskSchedule schedule() {
        return schedule;
    }

    public Instant publishedAt() {
        return publishedAt;
    }

    public Instant openedAt() {
        return openedAt;
    }

    public Instant closedAt() {
        return closedAt;
    }

    public TaskClosureType closureType() {
        return closureType;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    private TaskLifecycleHistory close(
            TaskLifecycleHistoryId historyId,
            TaskClosureType type,
            TaskLifecycleTrigger trigger,
            TaskActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        TaskStatus previous = status;
        TaskSchedule previousSchedule = schedule;
        status = TaskStatus.CLOSED;
        closureType = type;
        closedAt = occurredAt;
        updatedAt = occurredAt;
        TaskLifecycleEventType eventType = type == TaskClosureType.CANCELLED
                ? TaskLifecycleEventType.CANCELLED
                : TaskLifecycleEventType.CLOSED;
        return history(
                historyId, eventType,
                previous, status, previousSchedule, schedule,
                trigger, actorId, reason, type, occurredAt);
    }

    private TaskLifecycleHistory history(
            TaskLifecycleHistoryId historyId,
            TaskLifecycleEventType eventType,
            TaskStatus previousStatus,
            TaskStatus newStatus,
            TaskSchedule previousSchedule,
            TaskSchedule newSchedule,
            TaskLifecycleTrigger trigger,
            TaskActorId actorId,
            String reason,
            TaskClosureType historyClosureType,
            Instant occurredAt
    ) {
        return new TaskLifecycleHistory(
                historyId, id, eventType, previousStatus, newStatus,
                previousSchedule, newSchedule, trigger, actorId, reason,
                historyClosureType, occurredAt);
    }

    private void validatePublishable() {
        List<TaskViolation> violations = new ArrayList<>();
        if (questions.isEmpty()) {
            violations.add(TaskViolation.of(
                    "TASK_QUESTIONS_REQUIRED",
                    "questions",
                    "published task must have at least one question"));
        }
        for (int index = 0; index < questions.size(); index++) {
            TaskQuestion question = questions.get(index);
            if (question.displayOrder() != index + 1) {
                violations.add(TaskViolation.of(
                        "TASK_QUESTION_ORDER_NOT_CONTINUOUS",
                        "questions",
                        "question displayOrder must be continuous from 1"));
                break;
            }
            if (!question.hasContinuousOptionOrder()) {
                violations.add(TaskViolation.of(
                        "TASK_OPTION_ORDER_NOT_CONTINUOUS",
                        "questions[" + index + "].options",
                        "option displayOrder must be continuous from 1"));
            }
        }
        if (!violations.isEmpty()) {
            throw new TaskValidationException(violations);
        }
    }

    private static List<TaskQuestion> normalizeQuestions(
            List<TaskQuestion> questions
    ) {
        Objects.requireNonNull(questions, "questions");
        if (questions.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "questions must not contain null");
        }
        if (questions.size() > TaskLimits.MAX_QUESTIONS) {
            throw TaskDomainException.invariant(
                    "TASK_QUESTIONS_TOO_MANY",
                    "questions",
                    "task must not exceed " + TaskLimits.MAX_QUESTIONS
                            + " questions");
        }
        List<TaskQuestion> normalized = questions.stream()
                .sorted(Comparator.comparingInt(TaskQuestion::displayOrder))
                .toList();
        ensureUnique(normalized, TaskQuestion::id,
                "TASK_QUESTION_ID_DUPLICATED");
        ensureUnique(normalized, TaskQuestion::displayOrder,
                "TASK_QUESTION_DISPLAY_ORDER_DUPLICATED");
        return normalized;
    }

    private static <T> void ensureUnique(
            List<TaskQuestion> questions,
            Function<TaskQuestion, T> key,
            String code
    ) {
        Set<T> values = new HashSet<>();
        if (questions.stream().map(key).anyMatch(value -> !values.add(value))) {
            throw TaskDomainException.invariant(
                    code,
                    "questions",
                    "duplicate question value is not allowed");
        }
    }

    private void validateConsistency() {
        if (updatedAt.isBefore(createdAt)) {
            throw inconsistent("updatedAt must not be before createdAt");
        }
        switch (status) {
            case DRAFT -> {
                if (schedule != null || publishedAt != null || openedAt != null
                        || closedAt != null || closureType != null) {
                    throw inconsistent("draft fields are inconsistent");
                }
            }
            case SCHEDULED -> {
                validatePublishedFields();
                if (openedAt != null || closedAt != null || closureType != null) {
                    throw inconsistent("scheduled fields are inconsistent");
                }
                validatePublishable();
            }
            case OPEN -> {
                validatePublishedFields();
                if (openedAt == null || closedAt != null || closureType != null) {
                    throw inconsistent("open fields are inconsistent");
                }
                validatePublishable();
            }
            case CLOSED -> {
                if (closedAt == null || closureType == null) {
                    throw inconsistent("closed fields are inconsistent");
                }
                if (closureType == TaskClosureType.CANCELLED) {
                    validateCancelledFields();
                } else {
                    validatePublishedFields();
                    validatePublishable();
                }
                if ((closureType == TaskClosureType.DEADLINE_REACHED
                        || closureType == TaskClosureType.EARLY_CLOSED)
                        && openedAt == null) {
                    throw inconsistent("completed task must have openedAt");
                }
                if (closureType == TaskClosureType.MISSED_SCHEDULE
                        && openedAt != null) {
                    throw inconsistent("missed task must not have openedAt");
                }
            }
        }
        if (publishedAt != null && publishedAt.isBefore(createdAt)) {
            throw inconsistent("publishedAt must not be before createdAt");
        }
        if (openedAt != null && openedAt.isBefore(createdAt)) {
            throw inconsistent("openedAt must not be before createdAt");
        }
        if (closedAt != null && closedAt.isBefore(createdAt)) {
            throw inconsistent("closedAt must not be before createdAt");
        }
        if (publishedAt != null && publishedAt.isAfter(updatedAt)) {
            throw inconsistent("publishedAt must not be after updatedAt");
        }
        if (openedAt != null && (publishedAt == null
                || openedAt.isBefore(publishedAt)
                || openedAt.isAfter(updatedAt))) {
            throw inconsistent("openedAt is inconsistent with audit times");
        }
        if (closedAt != null && (closedAt.isAfter(updatedAt)
                || openedAt != null && closedAt.isBefore(openedAt))) {
            throw inconsistent("closedAt is inconsistent with audit times");
        }
        validateClosureTiming();
    }

    private void validatePublishedFields() {
        if (schedule == null || publishedAt == null) {
            throw inconsistent("published task requires schedule and publishedAt");
        }
    }

    private void validateCancelledFields() {
        if (schedule == null) {
            if (publishedAt != null || openedAt != null) {
                throw inconsistent(
                        "cancelled draft fields are inconsistent");
            }
            return;
        }
        if (publishedAt == null) {
            throw inconsistent(
                    "cancelled published task requires publishedAt");
        }
        validatePublishable();
    }

    private void validateClosureTiming() {
        if (status != TaskStatus.CLOSED || schedule == null) {
            return;
        }
        if (closureType == TaskClosureType.DEADLINE_REACHED
                && closedAt.isBefore(schedule.scheduledCloseAt())) {
            throw inconsistent(
                    "deadline closure must not precede scheduledCloseAt");
        }
        if (closureType == TaskClosureType.EARLY_CLOSED
                && !closedAt.isBefore(schedule.scheduledCloseAt())) {
            throw inconsistent(
                    "early closure must precede scheduledCloseAt");
        }
        if (closureType == TaskClosureType.MISSED_SCHEDULE
                && closedAt.isBefore(schedule.scheduledCloseAt())) {
            throw inconsistent(
                    "missed schedule closure requires elapsed window");
        }
    }

    private void requireStatus(TaskStatus required, String action) {
        if (status != required) {
            throw transitionNotAllowed(action);
        }
    }

    private void requireMonotonic(Instant occurredAt) {
        Objects.requireNonNull(occurredAt, "occurredAt");
        if (occurredAt.isBefore(updatedAt)) {
            throw TaskDomainException.invariant(
                    "TASK_TIME_NOT_MONOTONIC",
                    "occurredAt",
                    "occurredAt must not be before updatedAt");
        }
    }

    private static void requireFutureSchedule(
            TaskSchedule schedule,
            Instant occurredAt
    ) {
        Objects.requireNonNull(schedule, "schedule");
        if (!occurredAt.isBefore(schedule.scheduledOpenAt())) {
            throw TaskDomainException.invariant(
                    "TASK_SCHEDULE_OPEN_MUST_BE_FUTURE",
                    "schedule.scheduledOpenAt",
                    "scheduledOpenAt must be in the future");
        }
    }

    private TaskDomainException transitionNotAllowed(String action) {
        return TaskDomainException.invariant(
                "TASK_TRANSITION_NOT_ALLOWED",
                "status",
                action + " is not allowed from " + status);
    }

    private static TaskDomainException inconsistent(String message) {
        return TaskDomainException.invariant(
                "TASK_STATE_INCONSISTENT",
                "status",
                message);
    }

    private static String normalizeTitle(String title) {
        return TaskText.required(
                title,
                TaskLimits.MAX_TITLE_LENGTH,
                "TASK_TITLE",
                "title");
    }

    private static String normalizeDescription(String description) {
        return TaskText.optional(
                description,
                TaskLimits.MAX_DESCRIPTION_LENGTH,
                "TASK_DESCRIPTION",
                "description");
    }
}
