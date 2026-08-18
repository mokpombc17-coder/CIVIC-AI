package com.hamcheeze.vote.persona.infra.persistence.jpa;

import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "persona_versions")
class PersonaVersionJpaEntity {

    @Id
    @Column(name = "persona_version_id", nullable = false)
    private UUID id;

    @Column(name = "generation_id", nullable = false)
    private UUID generationId;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "provider_persona_id", nullable = false, length = 512)
    private String providerPersonaId;

    @Column(
            name = "predicted_adoption_rate",
            nullable = false,
            precision = 7,
            scale = 6)
    private BigDecimal predictedAdoptionRate;

    @Column(name = "model_version", nullable = false, length = 128)
    private String modelVersion;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 30)
    private PersonaSourceType sourceType;

    @Column(name = "source_id", nullable = false)
    private UUID sourceId;

    protected PersonaVersionJpaEntity() {
    }

    PersonaVersionJpaEntity(PersonaVersion version) {
        id = version.personaVersionId().value();
        generationId = version.generationId().value();
        userId = version.userId().value();
        providerPersonaId = version.providerPersonaId().value();
        predictedAdoptionRate = version.predictedAdoptionRate().value();
        modelVersion = version.modelVersion().value();
        generatedAt = version.generatedAt();
        sourceType = version.sourceType();
        sourceId = version.sourceId().value();
    }

    UUID id() {
        return id;
    }

    UUID generationId() {
        return generationId;
    }

    String userId() {
        return userId;
    }

    String providerPersonaId() {
        return providerPersonaId;
    }

    BigDecimal predictedAdoptionRate() {
        return predictedAdoptionRate;
    }

    String modelVersion() {
        return modelVersion;
    }

    Instant generatedAt() {
        return generatedAt;
    }

    PersonaSourceType sourceType() {
        return sourceType;
    }

    UUID sourceId() {
        return sourceId;
    }
}
