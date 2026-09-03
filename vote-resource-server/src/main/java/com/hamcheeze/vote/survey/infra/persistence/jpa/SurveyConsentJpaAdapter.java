package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.consent.SurveyConsentRepository;
import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentReceipt;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
class SurveyConsentJpaAdapter implements SurveyConsentRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public SurveyConsentDocument saveDocument(
            SurveyConsentDocument document
    ) {
        SurveyConsentDocumentJpaEntity stored = entityManager.find(
                SurveyConsentDocumentJpaEntity.class,
                document.roundId().value());
        if (stored == null) {
            stored = new SurveyConsentDocumentJpaEntity(document);
            entityManager.persist(stored);
        } else {
            stored.replace(document);
        }
        entityManager.flush();
        return toDomain(stored);
    }

    @Override
    public Optional<SurveyConsentDocument> findDocumentByRoundId(
            SurveyRoundId roundId
    ) {
        return Optional.ofNullable(entityManager.find(
                        SurveyConsentDocumentJpaEntity.class,
                        roundId.value()))
                .map(SurveyConsentJpaAdapter::toDomain);
    }

    @Override
    public SurveyConsentReceipt insertReceipt(
            SurveyConsentReceipt receipt
    ) {
        entityManager.persist(new SurveyConsentReceiptJpaEntity(receipt));
        entityManager.flush();
        return receipt;
    }

    @Override
    public Optional<SurveyConsentReceipt> findReceiptById(
            ConsentReceiptId receiptId
    ) {
        return Optional.ofNullable(entityManager.find(
                        SurveyConsentReceiptJpaEntity.class,
                        receiptId.value()))
                .map(SurveyConsentJpaAdapter::toDomain);
    }

    @Override
    public Optional<SurveyConsentReceipt>
    findReceiptByUserIdAndIdempotencyKey(
            SurveyUserId userId,
            UUID idempotencyKey
    ) {
        return entityManager.createQuery("""
                        select receipt
                        from SurveyConsentReceiptJpaEntity receipt
                        where receipt.userId = :userId
                          and receipt.idempotencyKey = :idempotencyKey
                        """, SurveyConsentReceiptJpaEntity.class)
                .setParameter("userId", userId.value())
                .setParameter("idempotencyKey", idempotencyKey)
                .getResultStream()
                .findFirst()
                .map(SurveyConsentJpaAdapter::toDomain);
    }

    private static SurveyConsentDocument toDomain(
            SurveyConsentDocumentJpaEntity entity
    ) {
        return new SurveyConsentDocument(
                new SurveyRoundId(entity.roundId()),
                entity.documentCode(),
                entity.documentVersion(),
                entity.title(),
                entity.documentContent(),
                entity.documentHash(),
                entity.publishedAt());
    }

    private static SurveyConsentReceipt toDomain(
            SurveyConsentReceiptJpaEntity entity
    ) {
        return new SurveyConsentReceipt(
                new ConsentReceiptId(entity.consentReceiptId()),
                new SurveyUserId(entity.userId()),
                new SurveyRoundId(entity.roundId()),
                entity.documentCode(),
                entity.documentVersion(),
                entity.documentContentSnapshot(),
                entity.documentHash(),
                entity.acceptedAt(),
                entity.clientClickedAt(),
                entity.idempotencyKey(),
                entity.requestHash());
    }
}
