package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class PersonaGenerationStateService {

    private final PersonaGenerationRepository generations;
    private final PersonaVersionRepository versions;
    private final Clock clock;

    @Autowired
    public PersonaGenerationStateService(
            PersonaGenerationRepository generations,
            PersonaVersionRepository versions
    ) {
        this(generations, versions, Clock.systemUTC());
    }

    PersonaGenerationStateService(
            PersonaGenerationRepository generations,
            PersonaVersionRepository versions,
            Clock clock
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.versions = Objects.requireNonNull(versions, "versions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public Optional<PersonaGeneration> claimNext() {
        Instant now = clock.instant();
        Optional<PersonaGeneration> candidate =
                generations.findNextDispatchableForUpdate(now);
        candidate.ifPresent(generation -> {
            generation.startProcessing(now);
            generations.save(generation);
        });
        return candidate;
    }

    @Transactional
    public PersonaVersion succeed(
            PersonaGenerationId generationId,
            PersonaSurveySource source,
            PersonaCreationResult result
    ) {
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(result, "result");
        if (!generationId.equals(result.generationId())) {
            throw new IllegalArgumentException(
                    "result generation ID must match");
        }
        PersonaGeneration generation = requireGeneration(generationId);
        PersonaSourceId sourceId = source.responseId();
        if (generation.sourceType() != PersonaSourceType.SURVEY_RESPONSE
                || !generation.sourceId().equals(sourceId)) {
            throw new IllegalArgumentException(
                    "survey source must match generation source");
        }
        Instant succeededAt = clock.instant();
        generation.succeed(result.personaId(), succeededAt);
        generations.save(generation);
        return versions.insert(new PersonaVersion(
                new PersonaVersionId(UUID.randomUUID()),
                generation.id(),
                source.userId(),
                result.personaId(),
                result.predictedAdoptionRate(),
                result.modelVersion(),
                succeededAt,
                PersonaSourceType.SURVEY_RESPONSE,
                sourceId));
    }

    @Transactional
    public void fail(
            PersonaGenerationId generationId,
            String errorCode,
            Instant retryAt
    ) {
        PersonaGeneration generation = requireGeneration(generationId);
        generation.fail(errorCode, clock.instant(), retryAt);
        generations.save(generation);
    }

    private PersonaGeneration requireGeneration(
            PersonaGenerationId generationId
    ) {
        return generations.findById(generationId)
                .orElseThrow(() -> new IllegalStateException(
                        "persona generation not found"));
    }
}
