package com.hamcheeze.vote.survey.application.persona;

import com.hamcheeze.vote.survey.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.persona.PersonaGeneration;
import com.hamcheeze.vote.survey.domain.persona.PersonaId;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

@Service
public class PersonaGenerationStateService {

    private final PersonaGenerationRepository generations;
    private final Clock clock;

    @Autowired
    public PersonaGenerationStateService(
            PersonaGenerationRepository generations
    ) {
        this(generations, Clock.systemUTC());
    }

    PersonaGenerationStateService(
            PersonaGenerationRepository generations,
            Clock clock
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
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
    public void succeed(
            PersonaGenerationId generationId,
            PersonaId personaId
    ) {
        PersonaGeneration generation = requireGeneration(generationId);
        generation.succeed(personaId, clock.instant());
        generations.save(generation);
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
