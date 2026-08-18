package com.hamcheeze.vote.persona.infra.persistence.jpa;

import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.PersonaGenerationPersistenceException;
import com.hamcheeze.vote.persona.application.PersonaGenerationPersistenceException.ErrorCode;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaGenerationStatus;
import com.hamcheeze.vote.persona.domain.PersonaId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class PersonaGenerationJpaAdapter
        implements PersonaGenerationRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public PersonaGeneration insert(PersonaGeneration generation) {
        try {
            PersonaGenerationJpaEntity entity =
                    new PersonaGenerationJpaEntity(generation);
            entityManager.persist(entity);
            entityManager.flush();
            return PersonaGenerationJpaMapper.toDomain(entity);
        } catch (RuntimeException exception) {
            throw translateConstraint(exception);
        }
    }

    @Override
    @Transactional
    public PersonaGeneration save(PersonaGeneration generation) {
        PersonaGenerationJpaEntity entity = entityManager.find(
                PersonaGenerationJpaEntity.class,
                generation.id().value(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            throw new IllegalStateException("persona generation not found");
        }
        try {
            entity.updateFrom(generation);
            entityManager.flush();
            return PersonaGenerationJpaMapper.toDomain(entity);
        } catch (RuntimeException exception) {
            throw translateConstraint(exception);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonaGeneration> findById(
            PersonaGenerationId generationId
    ) {
        return Optional.ofNullable(entityManager.find(
                        PersonaGenerationJpaEntity.class,
                        generationId.value()))
                .map(PersonaGenerationJpaMapper::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonaGeneration> findBySourceResponseId(
            PersonaSourceId responseId
    ) {
        return single(entityManager.createQuery(
                        """
                        select generation
                        from PersonaGenerationJpaEntity generation
                        where generation.sourceResponseId = :responseId
                        """,
                        PersonaGenerationJpaEntity.class)
                .setParameter("responseId", responseId.value())
                .getResultList());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonaGeneration> findByPersonaId(PersonaId personaId) {
        return single(entityManager.createQuery(
                        """
                        select generation
                        from PersonaGenerationJpaEntity generation
                        where generation.personaId = :personaId
                        """,
                        PersonaGenerationJpaEntity.class)
                .setParameter("personaId", personaId.value())
                .getResultList());
    }

    @Override
    @Transactional
    public Optional<PersonaGeneration> findNextDispatchableForUpdate(
            Instant readyAt
    ) {
        List<PersonaGenerationJpaEntity> matches = entityManager.createQuery(
                        """
                        select generation
                        from PersonaGenerationJpaEntity generation
                        where generation.status in :statuses
                          and generation.nextAttemptAt is not null
                          and generation.nextAttemptAt <= :readyAt
                        order by generation.nextAttemptAt, generation.createdAt
                        """,
                        PersonaGenerationJpaEntity.class)
                .setParameter("readyAt", readyAt)
                .setParameter("statuses", List.of(
                        PersonaGenerationStatus.PENDING,
                        PersonaGenerationStatus.FAILED))
                .setMaxResults(1)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList();
        return single(matches);
    }

    private static Optional<PersonaGeneration> single(
            List<PersonaGenerationJpaEntity> matches
    ) {
        return matches.stream().findFirst()
                .map(PersonaGenerationJpaMapper::toDomain);
    }

    private static RuntimeException translateConstraint(
            RuntimeException exception
    ) {
        String messages = causeMessages(exception);
        ErrorCode code;
        if (messages.contains("uq_persona_generation_response")) {
            code = ErrorCode.RESPONSE_ALREADY_LINKED;
        } else if (messages.contains("uq_persona_generation_persona")) {
            code = ErrorCode.PERSONA_ID_ALREADY_LINKED;
        } else if (!isConstraintFailure(exception)) {
            return exception;
        } else {
            code = ErrorCode.INTEGRITY_CONSTRAINT_VIOLATION;
        }
        return new PersonaGenerationPersistenceException(
                code, "persona generation persistence constraint violated",
                exception);
    }

    private static String causeMessages(Throwable throwable) {
        StringBuilder result = new StringBuilder();
        Throwable current = throwable;
        while (current != null) {
            if (current.getMessage() != null) {
                result.append(current.getMessage()).append('\n');
            }
            current = current.getCause();
        }
        return result.toString();
    }

    private static boolean isConstraintFailure(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            String type = current.getClass().getSimpleName();
            if (type.contains("ConstraintViolation")
                    || type.contains("DataIntegrityViolation")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
