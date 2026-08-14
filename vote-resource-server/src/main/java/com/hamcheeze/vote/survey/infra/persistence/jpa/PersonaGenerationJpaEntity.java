package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.persona.PersonaGeneration;
import com.hamcheeze.vote.survey.domain.persona.PersonaGenerationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "persona_generations")
class PersonaGenerationJpaEntity {

    @Id
    @Column(name = "generation_id", nullable = false)
    private UUID id;

    @Column(name = "survey_response_id", nullable = false)
    private UUID sourceResponseId;

    @Column(name = "persona_id", length = 512)
    private String personaId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PersonaGenerationStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "last_error_code", length = 100)
    private String lastErrorCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "processing_started_at")
    private Instant processingStartedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PersonaGenerationJpaEntity() {
    }

    PersonaGenerationJpaEntity(PersonaGeneration generation) {
        updateFrom(generation);
    }

    void updateFrom(PersonaGeneration generation) {
        UUID generationId = generation.id().value();
        if (id != null && !id.equals(generationId)) {
            throw new IllegalArgumentException("generation ID must match");
        }
        id = generationId;
        sourceResponseId = generation.sourceResponseId().value();
        personaId = generation.personaId()
                .map(value -> value.value()).orElse(null);
        status = generation.status();
        attemptCount = generation.attemptCount();
        lastErrorCode = generation.lastErrorCode().orElse(null);
        createdAt = generation.createdAt();
        processingStartedAt = generation.processingStartedAt().orElse(null);
        completedAt = generation.completedAt().orElse(null);
        nextAttemptAt = generation.nextAttemptAt().orElse(null);
        updatedAt = generation.updatedAt();
    }

    UUID id() {
        return id;
    }

    UUID sourceResponseId() {
        return sourceResponseId;
    }

    String personaId() {
        return personaId;
    }

    PersonaGenerationStatus status() {
        return status;
    }

    int attemptCount() {
        return attemptCount;
    }

    String lastErrorCode() {
        return lastErrorCode;
    }

    Instant createdAt() {
        return createdAt;
    }

    Instant processingStartedAt() {
        return processingStartedAt;
    }

    Instant completedAt() {
        return completedAt;
    }

    Instant nextAttemptAt() {
        return nextAttemptAt;
    }

    Instant updatedAt() {
        return updatedAt;
    }
}
