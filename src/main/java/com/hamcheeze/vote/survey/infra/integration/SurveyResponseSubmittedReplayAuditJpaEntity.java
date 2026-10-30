package com.hamcheeze.vote.survey.infra.integration;

import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayAudit;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "survey_response_submitted_replays")
class SurveyResponseSubmittedReplayAuditJpaEntity {

    @Id
    @Column(name = "original_event_id", nullable = false)
    private UUID originalEventId;

    @Column(name = "replay_event_id", nullable = false, unique = true)
    private UUID replayEventId;

    @Column(name = "requested_by", nullable = false, length = 200)
    private String requestedBy;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "reason", nullable = false, length = 1000)
    private String reason;

    protected SurveyResponseSubmittedReplayAuditJpaEntity() {
    }

    SurveyResponseSubmittedReplayAuditJpaEntity(
            SurveyResponseSubmittedReplayAudit audit
    ) {
        this.originalEventId = audit.originalEventId();
        this.replayEventId = audit.replayEventId();
        this.requestedBy = audit.requestedBy();
        this.requestedAt = audit.requestedAt();
        this.reason = audit.reason();
    }

    SurveyResponseSubmittedReplayAudit toDomain() {
        return new SurveyResponseSubmittedReplayAudit(
                originalEventId,
                replayEventId,
                requestedBy,
                requestedAt,
                reason);
    }
}
