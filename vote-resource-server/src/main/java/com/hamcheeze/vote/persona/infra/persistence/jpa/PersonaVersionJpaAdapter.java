package com.hamcheeze.vote.persona.infra.persistence.jpa;

import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public class PersonaVersionJpaAdapter implements PersonaVersionRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public PersonaVersion insert(PersonaVersion version) {
        PersonaVersionJpaEntity entity =
                new PersonaVersionJpaEntity(version);
        entityManager.persist(entity);
        entityManager.flush();
        return PersonaVersionJpaMapper.toDomain(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonaVersion> findById(PersonaVersionId versionId) {
        return Optional.ofNullable(entityManager.find(
                        PersonaVersionJpaEntity.class,
                        versionId.value()))
                .map(PersonaVersionJpaMapper::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonaVersion> findByGenerationId(
            PersonaGenerationId generationId
    ) {
        return single(entityManager.createQuery(
                        """
                        select version
                        from PersonaVersionJpaEntity version
                        where version.generationId = :generationId
                        """,
                        PersonaVersionJpaEntity.class)
                .setParameter("generationId", generationId.value())
                .setMaxResults(1)
                .getResultList());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PersonaVersion> findLatestByUserId(
            PersonaUserId userId
    ) {
        return single(entityManager.createQuery(
                        """
                        select version
                        from PersonaVersionJpaEntity version
                        where version.userId = :userId
                        order by version.generatedAt desc, version.id desc
                        """,
                        PersonaVersionJpaEntity.class)
                .setParameter("userId", userId.value())
                .setMaxResults(1)
                .getResultList());
    }

    private static Optional<PersonaVersion> single(
            List<PersonaVersionJpaEntity> matches
    ) {
        return matches.stream().findFirst()
                .map(PersonaVersionJpaMapper::toDomain);
    }
}
