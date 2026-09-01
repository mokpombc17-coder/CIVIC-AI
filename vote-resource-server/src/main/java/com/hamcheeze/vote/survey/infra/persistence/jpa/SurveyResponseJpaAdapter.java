package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
public class SurveyResponseJpaAdapter implements SurveyResponseRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public SurveyResponse insert(SurveyResponse response) {
        if (entityManager.find(
                SurveyResponseJpaEntity.class,
                response.id().value()) != null) {
            throw new UnsupportedOperationException(
                    "final survey response is immutable: " + response.id());
        }
        entityManager.persist(new SurveyResponseJpaEntity(response));
        persistAnswers(response);
        entityManager.flush();
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByUserIdAndRoundId(
            SurveyUserId userId,
            SurveyRoundId roundId
    ) {
        return entityManager.createQuery("""
                        SELECT count(response)
                        FROM SurveyResponseJpaEntity response
                        WHERE response.userId = :userId
                          AND response.roundId = :roundId
                        """, Long.class)
                .setParameter("userId", userId.value())
                .setParameter("roundId", roundId.value())
                .getSingleResult() > 0;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyResponse> findByUserIdAndRoundId(
            SurveyUserId userId,
            SurveyRoundId roundId
    ) {
        List<SurveyResponseJpaEntity> responses = entityManager
                .createQuery("""
                        SELECT response
                        FROM SurveyResponseJpaEntity response
                        JOIN FETCH response.round
                        WHERE response.userId = :userId
                          AND response.roundId = :roundId
                        """, SurveyResponseJpaEntity.class)
                .setParameter("userId", userId.value())
                .setParameter("roundId", roundId.value())
                .setMaxResults(1)
                .getResultList();
        return responses.isEmpty()
                ? Optional.empty()
                : Optional.of(hydrate(responses).getFirst());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyResponse> findById(SurveyResponseId responseId) {
        List<SurveyResponseJpaEntity> responses = entityManager
                .createQuery("""
                        SELECT response
                        FROM SurveyResponseJpaEntity response
                        JOIN FETCH response.round
                        WHERE response.id = :responseId
                        """, SurveyResponseJpaEntity.class)
                .setParameter("responseId", responseId.value())
                .getResultList();
        return responses.isEmpty()
                ? Optional.empty()
                : Optional.of(hydrate(responses).getFirst());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyResponse> findByIdAndUserId(
            SurveyResponseId responseId,
            SurveyUserId userId
    ) {
        List<SurveyResponseJpaEntity> responses = entityManager
                .createQuery("""
                        SELECT response
                        FROM SurveyResponseJpaEntity response
                        JOIN FETCH response.round
                        WHERE response.id = :responseId
                          AND response.userId = :userId
                        """, SurveyResponseJpaEntity.class)
                .setParameter("responseId", responseId.value())
                .setParameter("userId", userId.value())
                .getResultList();
        return responses.isEmpty()
                ? Optional.empty()
                : Optional.of(hydrate(responses).getFirst());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByUserId(SurveyUserId userId) {
        return entityManager.createQuery("""
                        SELECT count(response)
                        FROM SurveyResponseJpaEntity response
                        WHERE response.userId = :userId
                        """, Long.class)
                .setParameter("userId", userId.value())
                .getSingleResult() > 0;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyResponse> findLatestByUserId(
            SurveyUserId userId
    ) {
        List<SurveyResponseJpaEntity> responses = queryByUser(userId)
                .setMaxResults(1)
                .getResultList();
        return responses.isEmpty()
                ? Optional.empty()
                : Optional.of(hydrate(responses).getFirst());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SurveyResponse> findAllByUserId(SurveyUserId userId) {
        return hydrate(queryByUser(userId).getResultList());
    }

    private jakarta.persistence.TypedQuery<SurveyResponseJpaEntity> queryByUser(
            SurveyUserId userId
    ) {
        return entityManager.createQuery("""
                        SELECT response
                        FROM SurveyResponseJpaEntity response
                        JOIN FETCH response.round round
                        WHERE response.userId = :userId
                        ORDER BY round.roundNumber DESC,
                                 response.submittedAt DESC
                        """, SurveyResponseJpaEntity.class)
                .setParameter("userId", userId.value());
    }

    private void persistAnswers(SurveyResponse response) {
        UUID responseId = response.id().value();
        UUID contentVersionId = response.contentVersionId().value();
        for (SurveyAnswer answer : response.answers()) {
            UUID answerId = UUID.randomUUID();
            SurveyAnswerJpaEntity answerEntity = toEntity(
                    answerId,
                    responseId,
                    contentVersionId,
                    answer);
            entityManager.persist(answerEntity);
            selections(answer).forEach(selection -> entityManager.persist(
                    new SurveyAnswerSelectionJpaEntity(
                            UUID.randomUUID(),
                            answerId,
                            responseId,
                            contentVersionId,
                            answer.questionId().value(),
                            selection.optionId().value(),
                            selection.inputText())));
            persistItemValues(
                    answerId, responseId, contentVersionId, answer);
        }
    }

    private void persistItemValues(
            UUID answerId,
            UUID responseId,
            UUID contentVersionId,
            SurveyAnswer answer
    ) {
        switch (answer) {
            case MatrixSingleChoiceAnswer matrix -> matrix.itemAnswers()
                    .forEach(itemAnswer -> entityManager.persist(
                            new SurveyAnswerItemValueJpaEntity(
                                    UUID.randomUUID(),
                                    answerId,
                                    responseId,
                                    contentVersionId,
                                    answer.questionId().value(),
                                    itemAnswer.itemId().value(),
                                    answer.answerType(),
                                    itemAnswer.selection().optionId().value(),
                                    itemAnswer.selection().inputText(),
                                    null)));
            case MatrixScaleAnswer matrix -> matrix.itemAnswers()
                    .forEach(itemAnswer -> entityManager.persist(
                            new SurveyAnswerItemValueJpaEntity(
                                    UUID.randomUUID(),
                                    answerId,
                                    responseId,
                                    contentVersionId,
                                    answer.questionId().value(),
                                    itemAnswer.itemId().value(),
                                    answer.answerType(),
                                    null,
                                    null,
                                    itemAnswer.value())));
            default -> {
            }
        }
    }

    private SurveyAnswerJpaEntity toEntity(
            UUID answerId,
            UUID responseId,
            UUID contentVersionId,
            SurveyAnswer answer
    ) {
        String textValue = switch (answer) {
            case ShortTextAnswer text -> text.value();
            case LongTextAnswer text -> text.value();
            default -> null;
        };
        BigDecimal numberValue = answer instanceof NumberAnswer number
                ? number.value()
                : null;
        Integer scaleValue = answer instanceof ScaleAnswer scale
                ? scale.value()
                : null;
        return new SurveyAnswerJpaEntity(
                answerId,
                responseId,
                contentVersionId,
                answer.questionId().value(),
                answer.answerType(),
                textValue,
                numberValue,
                scaleValue);
    }

    private static List<OptionSelection> selections(SurveyAnswer answer) {
        return switch (answer) {
            case SingleChoiceAnswer single -> List.of(single.selection());
            case MultipleChoiceAnswer multiple -> multiple.selections();
            default -> List.of();
        };
    }

    private List<SurveyResponse> hydrate(
            List<SurveyResponseJpaEntity> responses
    ) {
        if (responses.isEmpty()) {
            return List.of();
        }
        List<UUID> responseIds = responses.stream()
                .map(SurveyResponseJpaEntity::id)
                .toList();
        List<SurveyAnswerJpaEntity> answers = entityManager
                .createQuery("""
                        SELECT answer
                        FROM SurveyAnswerJpaEntity answer
                        JOIN FETCH answer.question question
                        WHERE answer.responseId IN :responseIds
                        ORDER BY answer.responseId, question.displayOrder
                        """, SurveyAnswerJpaEntity.class)
                .setParameter("responseIds", responseIds)
                .getResultList();
        List<UUID> answerIds = answers.stream()
                .map(SurveyAnswerJpaEntity::id)
                .toList();
        List<SurveyAnswerSelectionJpaEntity> selections = answerIds.isEmpty()
                ? List.of()
                : entityManager.createQuery("""
                        SELECT selection
                        FROM SurveyAnswerSelectionJpaEntity selection
                        JOIN FETCH selection.option option
                        WHERE selection.answerId IN :answerIds
                        ORDER BY selection.answerId, option.displayOrder
                        """, SurveyAnswerSelectionJpaEntity.class)
                .setParameter("answerIds", answerIds)
                .getResultList();
        Map<UUID, List<SurveyAnswerJpaEntity>> answersByResponse =
                answers.stream().collect(Collectors.groupingBy(
                        SurveyAnswerJpaEntity::responseId,
                        LinkedHashMap::new,
                        Collectors.toList()));
        Map<UUID, List<SurveyAnswerSelectionJpaEntity>> selectionsByAnswer =
                selections.stream().collect(Collectors.groupingBy(
                        SurveyAnswerSelectionJpaEntity::answerId,
                        LinkedHashMap::new,
                        Collectors.toList()));
        List<SurveyAnswerItemValueJpaEntity> itemValues = answerIds.isEmpty()
                ? List.of()
                : entityManager.createQuery("""
                        SELECT value
                        FROM SurveyAnswerItemValueJpaEntity value
                        JOIN FETCH value.item item
                        WHERE value.answerId IN :answerIds
                        ORDER BY value.answerId, item.displayOrder
                        """, SurveyAnswerItemValueJpaEntity.class)
                .setParameter("answerIds", answerIds)
                .getResultList();
        Map<UUID, List<SurveyAnswerItemValueJpaEntity>> itemValuesByAnswer =
                itemValues.stream().collect(Collectors.groupingBy(
                        SurveyAnswerItemValueJpaEntity::answerId,
                        LinkedHashMap::new,
                        Collectors.toList()));
        List<SurveyResponse> result = new ArrayList<>(responses.size());
        for (SurveyResponseJpaEntity response : responses) {
            result.add(SurveyResponseJpaMapper.toDomain(
                    response,
                    answersByResponse.getOrDefault(response.id(), List.of()),
                    selectionsByAnswer,
                    itemValuesByAnswer));
        }
        return List.copyOf(result);
    }
}
