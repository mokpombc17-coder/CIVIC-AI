package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "survey_round_control")
class SurveyRoundControlJpaEntity {

    @Id
    @Column(name = "control_id", nullable = false, length = 30)
    private String id;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    protected SurveyRoundControlJpaEntity() {
    }

    long rowVersion() {
        return rowVersion;
    }
}

@Entity
@Table(name = "survey_rounds")
class SurveyRoundJpaEntity {

    @Id
    @Column(name = "round_id", nullable = false)
    private UUID id;

    @Column(name = "round_number", nullable = false)
    private long roundNumber;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SurveyRoundStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "enforcement_mode", length = 30)
    private SurveyRoundEnforcementMode enforcementMode;

    @Column(name = "scheduled_at")
    private Instant scheduledAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "canceled_at")
    private Instant canceledAt;

    @Column(name = "closed_by_round_id")
    private UUID closedByRoundId;

    @Column(name = "created_by", nullable = false, length = 255)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    protected SurveyRoundJpaEntity() {
    }

    SurveyRoundJpaEntity(SurveyRound round) {
        id = round.id().value();
        rowVersion = round.rowVersion();
        apply(round);
    }

    void apply(SurveyRound round) {
        roundNumber = round.roundNumber().value();
        contentVersionId = round.contentVersionId().value();
        status = round.status();
        enforcementMode = round.enforcementMode().orElse(null);
        scheduledAt = round.scheduledAt().orElse(null);
        activatedAt = round.activatedAt().orElse(null);
        closedAt = round.closedAt().orElse(null);
        canceledAt = round.canceledAt().orElse(null);
        closedByRoundId = round.closedByRoundId()
                .map(id -> id.value())
                .orElse(null);
        createdBy = round.createdBy().value();
        createdAt = round.createdAt();
    }

    UUID id() {
        return id;
    }

    long roundNumber() {
        return roundNumber;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    SurveyRoundStatus status() {
        return status;
    }

    SurveyRoundEnforcementMode enforcementMode() {
        return enforcementMode;
    }

    Instant scheduledAt() {
        return scheduledAt;
    }

    Instant activatedAt() {
        return activatedAt;
    }

    Instant closedAt() {
        return closedAt;
    }

    Instant canceledAt() {
        return canceledAt;
    }

    UUID closedByRoundId() {
        return closedByRoundId;
    }

    String createdBy() {
        return createdBy;
    }

    Instant createdAt() {
        return createdAt;
    }

    long rowVersion() {
        return rowVersion;
    }
}

@Entity
@Table(name = "survey_round_transitions")
class SurveyRoundTransitionJpaEntity {

    @Id
    @Column(name = "transition_id", nullable = false)
    private UUID id;

    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private SurveyRoundTransitionType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 30)
    private SurveyRoundStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 30)
    private SurveyRoundStatus toStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_enforcement_mode", length = 30)
    private SurveyRoundEnforcementMode fromEnforcementMode;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_enforcement_mode", length = 30)
    private SurveyRoundEnforcementMode toEnforcementMode;

    @Column(name = "previous_scheduled_at")
    private Instant previousScheduledAt;

    @Column(name = "new_scheduled_at")
    private Instant newScheduledAt;

    @Column(name = "actor_id", nullable = false, length = 255)
    private String actorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private SurveyRoundTransitionTrigger trigger;

    @Column(length = 500)
    private String reason;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "related_round_id")
    private UUID relatedRoundId;

    protected SurveyRoundTransitionJpaEntity() {
    }

    SurveyRoundTransitionJpaEntity(SurveyRoundTransition transition) {
        id = transition.id().value();
        roundId = transition.roundId().value();
        contentVersionId = transition.contentVersionId().value();
        type = transition.type();
        fromStatus = transition.fromStatus().orElse(null);
        toStatus = transition.toStatus().orElse(null);
        fromEnforcementMode = transition.fromEnforcementMode().orElse(null);
        toEnforcementMode = transition.toEnforcementMode().orElse(null);
        previousScheduledAt = transition.previousScheduledAt().orElse(null);
        newScheduledAt = transition.newScheduledAt().orElse(null);
        actorId = transition.actorId().value();
        trigger = transition.trigger();
        reason = transition.reason().orElse(null);
        occurredAt = transition.occurredAt();
        relatedRoundId = transition.relatedRoundId()
                .map(id -> id.value())
                .orElse(null);
    }

    UUID id() {
        return id;
    }

    UUID roundId() {
        return roundId;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    SurveyRoundTransitionType type() {
        return type;
    }

    SurveyRoundStatus fromStatus() {
        return fromStatus;
    }

    SurveyRoundStatus toStatus() {
        return toStatus;
    }

    SurveyRoundEnforcementMode fromEnforcementMode() {
        return fromEnforcementMode;
    }

    SurveyRoundEnforcementMode toEnforcementMode() {
        return toEnforcementMode;
    }

    Instant previousScheduledAt() {
        return previousScheduledAt;
    }

    Instant newScheduledAt() {
        return newScheduledAt;
    }

    String actorId() {
        return actorId;
    }

    SurveyRoundTransitionTrigger trigger() {
        return trigger;
    }

    String reason() {
        return reason;
    }

    Instant occurredAt() {
        return occurredAt;
    }

    UUID relatedRoundId() {
        return relatedRoundId;
    }
}
