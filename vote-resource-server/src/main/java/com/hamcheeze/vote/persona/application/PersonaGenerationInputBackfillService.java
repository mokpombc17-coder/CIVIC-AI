package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputSnapshotFactory;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Objects;
import java.util.Optional;

@Service
public class PersonaGenerationInputBackfillService {

    private final PersonaGenerationRepository generations;
    private final PersonaGenerationInputRepository inputs;
    private final PersonaGenerationInputSnapshotFactory snapshots;
    private final PersonaSurveySourceQueryPort sources;
    private final Clock clock;

    @Autowired
    public PersonaGenerationInputBackfillService(
            PersonaGenerationRepository generations,
            PersonaGenerationInputRepository inputs,
            PersonaGenerationInputSnapshotFactory snapshots,
            PersonaSurveySourceQueryPort sources
    ) {
        this(generations, inputs, snapshots, sources, Clock.systemUTC());
    }

    PersonaGenerationInputBackfillService(
            PersonaGenerationRepository generations,
            PersonaGenerationInputRepository inputs,
            PersonaGenerationInputSnapshotFactory snapshots,
            PersonaSurveySourceQueryPort sources,
            Clock clock
    ) {
        this.generations = Objects.requireNonNull(generations, "generations");
        this.inputs = Objects.requireNonNull(inputs, "inputs");
        this.snapshots = Objects.requireNonNull(snapshots, "snapshots");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public Optional<BackfillResult> backfillNext() {
        Optional<PersonaGeneration> candidate =
                generations.findNextMissingInputForUpdate();
        if (candidate.isEmpty()) {
            return Optional.empty();
        }
        PersonaGeneration generation = candidate.orElseThrow();
        if (inputs.findByGenerationId(generation.id()).isPresent()) {
            return Optional.of(new BackfillResult(generation, false));
        }
        PersonaSurveySource source;
        try {
            source = sources.getByResponseId(generation.sourceId());
        } catch (RuntimeException exception) {
            throw new BackfillException(
                    generation,
                    "Persona generation input source is unavailable",
                    exception);
        }
        if (!source.responseId().equals(generation.sourceId())) {
            throw new BackfillException(
                    generation,
                    "Persona generation input source integrity mismatch");
        }
        inputs.insert(snapshots.create(
                generation.id(), source, clock.instant()));
        return Optional.of(new BackfillResult(generation, true));
    }

    public record BackfillResult(
            PersonaGeneration generation,
            boolean created
    ) {
    }

    public static final class BackfillException extends RuntimeException {

        private final PersonaGeneration generation;

        BackfillException(
                PersonaGeneration generation,
                String message
        ) {
            super(message);
            this.generation = generation;
        }

        BackfillException(
                PersonaGeneration generation,
                String message,
                Throwable cause
        ) {
            super(message, cause);
            this.generation = generation;
        }

        public PersonaGeneration generation() {
            return generation;
        }
    }
}
