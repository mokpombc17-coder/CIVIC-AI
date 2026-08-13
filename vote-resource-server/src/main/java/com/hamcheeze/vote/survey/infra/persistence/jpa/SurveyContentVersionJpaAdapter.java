package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
public class SurveyContentVersionJpaAdapter
        implements SurveyContentVersionRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public SurveyContentVersion save(SurveyContentVersion contentVersion) {
        UUID id = contentVersion.id().value();
        SurveyContentVersionJpaEntity stored = entityManager.find(
                SurveyContentVersionJpaEntity.class,
                id);
        if (stored == null) {
            if (contentVersion.rowVersion() != 0) {
                throw stale(contentVersion);
            }
            entityManager.persist(
                    new SurveyContentVersionJpaEntity(contentVersion));
        } else {
            if (stored.status() == SurveyContentVersionStatus.PUBLISHED) {
                throw new UnsupportedOperationException(
                        "published survey content is immutable: " + id);
            }
            if (stored.rowVersion() != contentVersion.rowVersion()) {
                throw stale(contentVersion);
            }
            deleteChildren(id);
            stored.apply(contentVersion);
        }
        persistChildren(contentVersion);
        entityManager.flush();
        return findById(contentVersion.id()).orElseThrow();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyContentVersion> findById(
            SurveyContentVersionId contentVersionId
    ) {
        SurveyContentVersionJpaEntity content = entityManager.find(
                SurveyContentVersionJpaEntity.class,
                contentVersionId.value());
        if (content == null) {
            return Optional.empty();
        }
        return Optional.of(hydrate(List.of(content)).getFirst());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SurveyContentVersion> findAll() {
        List<SurveyContentVersionJpaEntity> contents = entityManager
                .createQuery("""
                        SELECT content
                        FROM SurveyContentVersionJpaEntity content
                        ORDER BY content.createdAt DESC, content.id
                        """, SurveyContentVersionJpaEntity.class)
                .getResultList();
        return hydrate(contents);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyContentVersion> findPublishedByVersionNumber(
            SurveyContentVersionNumber versionNumber
    ) {
        List<SurveyContentVersionJpaEntity> contents = entityManager
                .createQuery("""
                        SELECT content
                        FROM SurveyContentVersionJpaEntity content
                        WHERE content.status = :status
                          AND content.versionNumber = :versionNumber
                        """, SurveyContentVersionJpaEntity.class)
                .setParameter("status", SurveyContentVersionStatus.PUBLISHED)
                .setParameter("versionNumber", (long) versionNumber.value())
                .getResultList();
        return contents.isEmpty()
                ? Optional.empty()
                : Optional.of(hydrate(contents).getFirst());
    }

    private void deleteChildren(UUID contentVersionId) {
        entityManager.createQuery("""
                        SELECT option
                        FROM SurveyOptionJpaEntity option
                        WHERE option.contentVersionId = :contentVersionId
                        """, SurveyOptionJpaEntity.class)
                .setParameter("contentVersionId", contentVersionId)
                .getResultList()
                .forEach(entityManager::detach);
        entityManager.createQuery("""
                        SELECT question
                        FROM SurveyQuestionJpaEntity question
                        WHERE question.contentVersionId = :contentVersionId
                        """, SurveyQuestionJpaEntity.class)
                .setParameter("contentVersionId", contentVersionId)
                .getResultList()
                .forEach(entityManager::detach);
        entityManager.createQuery("""
                        DELETE FROM SurveyOptionJpaEntity option
                        WHERE option.contentVersionId = :contentVersionId
                        """)
                .setParameter("contentVersionId", contentVersionId)
                .executeUpdate();
        entityManager.createQuery("""
                        DELETE FROM SurveyQuestionJpaEntity question
                        WHERE question.contentVersionId = :contentVersionId
                        """)
                .setParameter("contentVersionId", contentVersionId)
                .executeUpdate();
    }

    private void persistChildren(SurveyContentVersion contentVersion) {
        UUID contentVersionId = contentVersion.id().value();
        contentVersion.questions().forEach(question -> {
            entityManager.persist(new SurveyQuestionJpaEntity(
                    contentVersionId,
                    question));
            question.options().forEach(option -> entityManager.persist(
                    new SurveyOptionJpaEntity(
                            contentVersionId,
                            question.id().value(),
                            option)));
        });
    }

    private List<SurveyContentVersion> hydrate(
            List<SurveyContentVersionJpaEntity> contents
    ) {
        if (contents.isEmpty()) {
            return List.of();
        }
        List<UUID> contentIds = contents.stream()
                .map(SurveyContentVersionJpaEntity::id)
                .toList();
        List<SurveyQuestionJpaEntity> questions = entityManager
                .createQuery("""
                        SELECT question
                        FROM SurveyQuestionJpaEntity question
                        WHERE question.contentVersionId IN :contentIds
                        ORDER BY question.contentVersionId,
                                 question.displayOrder
                        """, SurveyQuestionJpaEntity.class)
                .setParameter("contentIds", contentIds)
                .getResultList();
        List<UUID> questionIds = questions.stream()
                .map(SurveyQuestionJpaEntity::id)
                .toList();
        List<SurveyOptionJpaEntity> options = questionIds.isEmpty()
                ? List.of()
                : entityManager.createQuery("""
                        SELECT option
                        FROM SurveyOptionJpaEntity option
                        WHERE option.questionId IN :questionIds
                        ORDER BY option.questionId, option.displayOrder
                        """, SurveyOptionJpaEntity.class)
                .setParameter("questionIds", questionIds)
                .getResultList();
        Map<UUID, List<SurveyQuestionJpaEntity>> questionsByContent =
                questions.stream().collect(Collectors.groupingBy(
                        SurveyQuestionJpaEntity::contentVersionId,
                        LinkedHashMap::new,
                        Collectors.toList()));
        Map<UUID, List<SurveyOptionJpaEntity>> optionsByQuestion =
                options.stream().collect(Collectors.groupingBy(
                        SurveyOptionJpaEntity::questionId,
                        LinkedHashMap::new,
                        Collectors.toList()));
        List<SurveyContentVersion> result = new ArrayList<>(contents.size());
        for (SurveyContentVersionJpaEntity content : contents) {
            result.add(SurveyContentJpaMapper.toDomain(
                    content,
                    questionsByContent.getOrDefault(
                            content.id(), List.of()),
                    optionsByQuestion));
        }
        return List.copyOf(result);
    }

    private static OptimisticLockingFailureException stale(
            SurveyContentVersion contentVersion
    ) {
        return new OptimisticLockingFailureException(
                "stale survey content version: " + contentVersion.id());
    }
}
