package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.response.SurveyAnswerType;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinColumns;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "survey_responses")
class SurveyResponseJpaEntity {

    @Id
    @Column(name = "response_id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "round_id", nullable = false)
    private UUID roundId;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
            @JoinColumn(
                    name = "round_id",
                    referencedColumnName = "round_id",
                    insertable = false,
                    updatable = false),
            @JoinColumn(
                    name = "content_version_id",
                    referencedColumnName = "content_version_id",
                    insertable = false,
                    updatable = false)
    })
    private SurveyRoundJpaEntity round;

    protected SurveyResponseJpaEntity() {
    }

    SurveyResponseJpaEntity(SurveyResponse response) {
        id = response.id().value();
        userId = response.userId().value();
        roundId = response.roundId().value();
        contentVersionId = response.contentVersionId().value();
        submittedAt = response.submittedAt();
    }

    UUID id() {
        return id;
    }

    String userId() {
        return userId;
    }

    UUID roundId() {
        return roundId;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    Instant submittedAt() {
        return submittedAt;
    }

    SurveyRoundJpaEntity round() {
        return round;
    }
}

@Entity
@Immutable
@Table(name = "survey_answers")
class SurveyAnswerJpaEntity {

    @Id
    @Column(name = "answer_id", nullable = false)
    private UUID id;

    @Column(name = "response_id", nullable = false)
    private UUID responseId;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, length = 30)
    private SurveyAnswerType answerType;

    @Column(name = "text_value", length = 5000)
    private String textValue;

    @Column(name = "number_value", precision = 38, scale = 10)
    private BigDecimal numberValue;

    @Column(name = "scale_value")
    private Integer scaleValue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
            @JoinColumn(
                    name = "question_id",
                    referencedColumnName = "question_id",
                    insertable = false,
                    updatable = false),
            @JoinColumn(
                    name = "content_version_id",
                    referencedColumnName = "content_version_id",
                    insertable = false,
                    updatable = false)
    })
    private SurveyQuestionJpaEntity question;

    protected SurveyAnswerJpaEntity() {
    }

    SurveyAnswerJpaEntity(
            UUID id,
            UUID responseId,
            UUID contentVersionId,
            UUID questionId,
            SurveyAnswerType answerType,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue
    ) {
        this.id = id;
        this.responseId = responseId;
        this.contentVersionId = contentVersionId;
        this.questionId = questionId;
        this.answerType = answerType;
        this.textValue = textValue;
        this.numberValue = numberValue;
        this.scaleValue = scaleValue;
    }

    UUID id() {
        return id;
    }

    UUID responseId() {
        return responseId;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    UUID questionId() {
        return questionId;
    }

    SurveyAnswerType answerType() {
        return answerType;
    }

    String textValue() {
        return textValue;
    }

    BigDecimal numberValue() {
        return numberValue;
    }

    Integer scaleValue() {
        return scaleValue;
    }
}

@Entity
@Immutable
@Table(name = "survey_answer_selections")
class SurveyAnswerSelectionJpaEntity {

    @Id
    @Column(name = "selection_id", nullable = false)
    private UUID id;

    @Column(name = "answer_id", nullable = false)
    private UUID answerId;

    @Column(name = "response_id", nullable = false)
    private UUID responseId;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "option_id", nullable = false)
    private UUID optionId;

    @Column(name = "input_text", length = 200)
    private String inputText;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
            @JoinColumn(
                    name = "option_id",
                    referencedColumnName = "option_id",
                    insertable = false,
                    updatable = false),
            @JoinColumn(
                    name = "question_id",
                    referencedColumnName = "question_id",
                    insertable = false,
                    updatable = false),
            @JoinColumn(
                    name = "content_version_id",
                    referencedColumnName = "content_version_id",
                    insertable = false,
                    updatable = false)
    })
    private SurveyOptionJpaEntity option;

    protected SurveyAnswerSelectionJpaEntity() {
    }

    SurveyAnswerSelectionJpaEntity(
            UUID id,
            UUID answerId,
            UUID responseId,
            UUID contentVersionId,
            UUID questionId,
            UUID optionId,
            String inputText
    ) {
        this.id = id;
        this.answerId = answerId;
        this.responseId = responseId;
        this.contentVersionId = contentVersionId;
        this.questionId = questionId;
        this.optionId = optionId;
        this.inputText = inputText;
    }

    UUID answerId() {
        return answerId;
    }

    UUID optionId() {
        return optionId;
    }

    String inputText() {
        return inputText;
    }
}

@Entity
@Immutable
@Table(name = "survey_answer_item_values")
class SurveyAnswerItemValueJpaEntity {

    @Id
    @Column(name = "item_value_id", nullable = false)
    private UUID id;

    @Column(name = "answer_id", nullable = false)
    private UUID answerId;

    @Column(name = "response_id", nullable = false)
    private UUID responseId;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "item_id", nullable = false)
    private UUID itemId;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, length = 30)
    private SurveyAnswerType answerType;

    @Column(name = "option_id")
    private UUID optionId;

    @Column(name = "input_text", length = 200)
    private String inputText;

    @Column(name = "scale_value")
    private Integer scaleValue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumns({
            @JoinColumn(
                    name = "item_id",
                    referencedColumnName = "item_id",
                    insertable = false,
                    updatable = false),
            @JoinColumn(
                    name = "question_id",
                    referencedColumnName = "question_id",
                    insertable = false,
                    updatable = false),
            @JoinColumn(
                    name = "content_version_id",
                    referencedColumnName = "content_version_id",
                    insertable = false,
                    updatable = false)
    })
    private SurveyQuestionItemJpaEntity item;

    protected SurveyAnswerItemValueJpaEntity() {
    }

    SurveyAnswerItemValueJpaEntity(
            UUID id,
            UUID answerId,
            UUID responseId,
            UUID contentVersionId,
            UUID questionId,
            UUID itemId,
            SurveyAnswerType answerType,
            UUID optionId,
            String inputText,
            Integer scaleValue
    ) {
        this.id = id;
        this.answerId = answerId;
        this.responseId = responseId;
        this.contentVersionId = contentVersionId;
        this.questionId = questionId;
        this.itemId = itemId;
        this.answerType = answerType;
        this.optionId = optionId;
        this.inputText = inputText;
        this.scaleValue = scaleValue;
    }

    UUID answerId() {
        return answerId;
    }

    UUID itemId() {
        return itemId;
    }

    SurveyAnswerType answerType() {
        return answerType;
    }

    UUID optionId() {
        return optionId;
    }

    String inputText() {
        return inputText;
    }

    Integer scaleValue() {
        return scaleValue;
    }
}
