package com.hamcheeze.vote.survey.infra.integration;

import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayAudit;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseSubmittedReplayAuditRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Repository
public class SurveyResponseSubmittedReplayAuditJpaAdapter
        implements SurveyResponseSubmittedReplayAuditRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public SurveyResponseSubmittedReplayAudit insert(
            SurveyResponseSubmittedReplayAudit audit
    ) {
        SurveyResponseSubmittedReplayAuditJpaEntity entity =
                new SurveyResponseSubmittedReplayAuditJpaEntity(audit);
        entityManager.persist(entity);
        entityManager.flush();
        return entity.toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyResponseSubmittedReplayAudit>
    findByOriginalEventId(UUID originalEventId) {
        return Optional.ofNullable(entityManager.find(
                        SurveyResponseSubmittedReplayAuditJpaEntity.class,
                        originalEventId))
                .map(SurveyResponseSubmittedReplayAuditJpaEntity::toDomain);
    }
}
