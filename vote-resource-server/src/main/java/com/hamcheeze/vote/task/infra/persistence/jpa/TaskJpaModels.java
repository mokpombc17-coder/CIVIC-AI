package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.task.LongTextConstraint;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleEventType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleTrigger;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tasks")
class TaskJpaEntity {

    @Id
    @Column(name = "task_id", nullable = false)
    private UUID id;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", length = 2000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private TaskStatus status;

    @Column(name = "scheduled_open_at")
    private Instant scheduledOpenAt;

    @Column(name = "scheduled_close_at")
    private Instant scheduledCloseAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "opened_at")
    private Instant openedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "closure_type", length = 30)
    private TaskClosureType closureType;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TaskJpaEntity() {
    }

    TaskJpaEntity(Task task) {
        id = task.id().value();
        rowVersion = 0;
        createdAt = task.createdAt();
        apply(task);
    }

    void apply(Task task) {
        title = task.title();
        description = task.description();
        status = task.status();
        scheduledOpenAt = task.schedule() == null
                ? null : task.schedule().scheduledOpenAt();
        scheduledCloseAt = task.schedule() == null
                ? null : task.schedule().scheduledCloseAt();
        publishedAt = task.publishedAt();
        openedAt = task.openedAt();
        closedAt = task.closedAt();
        closureType = task.closureType();
        updatedAt = task.updatedAt();
    }

    UUID id() { return id; }
    long rowVersion() { return rowVersion; }
    String title() { return title; }
    String description() { return description; }
    TaskStatus status() { return status; }
    Instant scheduledOpenAt() { return scheduledOpenAt; }
    Instant scheduledCloseAt() { return scheduledCloseAt; }
    Instant publishedAt() { return publishedAt; }
    Instant openedAt() { return openedAt; }
    Instant closedAt() { return closedAt; }
    TaskClosureType closureType() { return closureType; }
    Instant createdAt() { return createdAt; }
    Instant updatedAt() { return updatedAt; }
}

@Entity
@Table(name = "task_questions")
class TaskQuestionJpaEntity {

    @Id
    @Column(name = "question_id", nullable = false)
    private UUID id;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 30)
    private TaskQuestionType type;

    @Column(name = "content", nullable = false, length = 500)
    private String content;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "minimum_selections")
    private Integer minimumSelections;

    @Column(name = "maximum_selections")
    private Integer maximumSelections;

    @Column(name = "text_max_length")
    private Integer textMaxLength;

    @Column(name = "number_minimum", precision = 25, scale = 6)
    private BigDecimal numberMinimum;

    @Column(name = "number_maximum", precision = 25, scale = 6)
    private BigDecimal numberMaximum;

    @Column(name = "decimal_allowed")
    private Boolean decimalAllowed;

    @Column(name = "scale_minimum")
    private Integer scaleMinimum;

    @Column(name = "scale_maximum")
    private Integer scaleMaximum;

    @Column(name = "scale_minimum_label", length = 100)
    private String scaleMinimumLabel;

    @Column(name = "scale_maximum_label", length = 100)
    private String scaleMaximumLabel;

    protected TaskQuestionJpaEntity() {
    }

    TaskQuestionJpaEntity(UUID taskId, TaskQuestion question) {
        id = question.id().value();
        this.taskId = taskId;
        type = question.type();
        content = question.content();
        description = question.description();
        displayOrder = question.displayOrder();
        switch (question.constraint()) {
            case MultipleChoiceConstraint multiple -> {
                minimumSelections = multiple.minimumSelections();
                maximumSelections = multiple.maximumSelections();
            }
            case ShortTextConstraint text -> textMaxLength = text.maxLength();
            case LongTextConstraint text -> textMaxLength = text.maxLength();
            case NumberConstraint number -> {
                numberMinimum = number.minimumValue();
                numberMaximum = number.maximumValue();
                decimalAllowed = number.decimalAllowed();
            }
            case ScaleConstraint scale -> {
                scaleMinimum = scale.minimumValue();
                scaleMaximum = scale.maximumValue();
                scaleMinimumLabel = scale.minimumLabel();
                scaleMaximumLabel = scale.maximumLabel();
            }
            default -> {
            }
        }
    }

    UUID id() { return id; }
    UUID taskId() { return taskId; }
    TaskQuestionType type() { return type; }
    String content() { return content; }
    String description() { return description; }
    int displayOrder() { return displayOrder; }
    Integer minimumSelections() { return minimumSelections; }
    Integer maximumSelections() { return maximumSelections; }
    Integer textMaxLength() { return textMaxLength; }
    BigDecimal numberMinimum() { return numberMinimum; }
    BigDecimal numberMaximum() { return numberMaximum; }
    Boolean decimalAllowed() { return decimalAllowed; }
    Integer scaleMinimum() { return scaleMinimum; }
    Integer scaleMaximum() { return scaleMaximum; }
    String scaleMinimumLabel() { return scaleMinimumLabel; }
    String scaleMaximumLabel() { return scaleMaximumLabel; }
}

@Entity
@Table(name = "task_options")
class TaskOptionJpaEntity {

    @Id
    @Column(name = "option_id", nullable = false)
    private UUID id;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "question_type", nullable = false, length = 30)
    private TaskQuestionType questionType;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 30)
    private TaskOptionKind kind;

    @Column(name = "content", nullable = false, length = 200)
    private String content;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    protected TaskOptionJpaEntity() {
    }

    TaskOptionJpaEntity(
            UUID taskId,
            TaskQuestion question,
            TaskOption option
    ) {
        id = option.id().value();
        this.taskId = taskId;
        questionId = question.id().value();
        questionType = question.type();
        kind = option.kind();
        content = option.content();
        displayOrder = option.displayOrder();
    }

    UUID id() { return id; }
    UUID questionId() { return questionId; }
    TaskOptionKind kind() { return kind; }
    String content() { return content; }
    int displayOrder() { return displayOrder; }
}

@Entity
@Table(name = "task_lifecycle_history")
class TaskLifecycleHistoryJpaEntity {

    @Id
    @Column(name = "history_id", nullable = false)
    private UUID id;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 30)
    private TaskLifecycleEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false, length = 30)
    private TaskStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 30)
    private TaskStatus newStatus;

    @Column(name = "previous_scheduled_open_at")
    private Instant previousScheduledOpenAt;

    @Column(name = "previous_scheduled_close_at")
    private Instant previousScheduledCloseAt;

    @Column(name = "new_scheduled_open_at")
    private Instant newScheduledOpenAt;

    @Column(name = "new_scheduled_close_at")
    private Instant newScheduledCloseAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "trigger", nullable = false, length = 30)
    private TaskLifecycleTrigger trigger;

    @Column(name = "actor_id", length = 255)
    private String actorId;

    @Column(name = "reason", length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "closure_type", length = 30)
    private TaskClosureType closureType;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected TaskLifecycleHistoryJpaEntity() {
    }

    TaskLifecycleHistoryJpaEntity(TaskLifecycleHistory history) {
        id = history.id().value();
        taskId = history.taskId().value();
        eventType = history.eventType();
        previousStatus = history.previousStatus();
        newStatus = history.newStatus();
        previousScheduledOpenAt = history.previousSchedule() == null
                ? null : history.previousSchedule().scheduledOpenAt();
        previousScheduledCloseAt = history.previousSchedule() == null
                ? null : history.previousSchedule().scheduledCloseAt();
        newScheduledOpenAt = history.newSchedule() == null
                ? null : history.newSchedule().scheduledOpenAt();
        newScheduledCloseAt = history.newSchedule() == null
                ? null : history.newSchedule().scheduledCloseAt();
        trigger = history.trigger();
        actorId = history.actorId() == null ? null : history.actorId().value();
        reason = history.reason();
        closureType = history.closureType();
        occurredAt = history.occurredAt();
    }

    UUID id() { return id; }
    UUID taskId() { return taskId; }
    TaskLifecycleEventType eventType() { return eventType; }
    TaskStatus previousStatus() { return previousStatus; }
    TaskStatus newStatus() { return newStatus; }
    Instant previousScheduledOpenAt() { return previousScheduledOpenAt; }
    Instant previousScheduledCloseAt() { return previousScheduledCloseAt; }
    Instant newScheduledOpenAt() { return newScheduledOpenAt; }
    Instant newScheduledCloseAt() { return newScheduledCloseAt; }
    TaskLifecycleTrigger trigger() { return trigger; }
    String actorId() { return actorId; }
    String reason() { return reason; }
    TaskClosureType closureType() { return closureType; }
    Instant occurredAt() { return occurredAt; }
}
