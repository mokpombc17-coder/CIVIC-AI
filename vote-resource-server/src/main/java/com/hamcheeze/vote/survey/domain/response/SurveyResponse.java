package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public final class SurveyResponse {

    private final SurveyResponseId id;
    private final SurveyUserId userId;
    private final SurveyRoundId roundId;
    private final SurveyRoundNumber roundNumber;
    private final SurveyContentVersionId contentVersionId;
    private final Instant submittedAt;
    private final List<SurveyAnswer> answers;

    private SurveyResponse(
            SurveyResponseId id,
            SurveyUserId userId,
            SurveyRoundId roundId,
            SurveyRoundNumber roundNumber,
            SurveyContentVersionId contentVersionId,
            Instant submittedAt,
            List<SurveyAnswer> answers
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.userId = Objects.requireNonNull(userId, "userId");
        this.roundId = Objects.requireNonNull(roundId, "roundId");
        this.roundNumber = Objects.requireNonNull(
                roundNumber,
                "roundNumber");
        this.contentVersionId = Objects.requireNonNull(
                contentVersionId,
                "contentVersionId");
        this.submittedAt = Objects.requireNonNull(
                submittedAt,
                "submittedAt");
        Objects.requireNonNull(answers, "answers");
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "answers must not contain null");
        }
        Set<SurveyQuestionId> questionIds = new HashSet<>();
        if (answers.stream()
                .map(SurveyAnswer::questionId)
                .anyMatch(questionId -> !questionIds.add(questionId))) {
            throw SurveyDomainException.invariant(
                    "SURVEY_RESPONSE_ANSWER_DUPLICATED",
                    "answers",
                    "response must have at most one answer per question");
        }
        this.answers = List.copyOf(answers);
    }

    static SurveyResponse createValidated(
            SurveyResponseId id,
            SurveyUserId userId,
            SurveyRoundId roundId,
            SurveyRoundNumber roundNumber,
            SurveyContentVersionId contentVersionId,
            Instant submittedAt,
            List<SurveyAnswer> answers
    ) {
        return new SurveyResponse(
                id,
                userId,
                roundId,
                roundNumber,
                contentVersionId,
                submittedAt,
                answers);
    }

    public static SurveyResponse rehydrate(
            SurveyResponseId id,
            SurveyUserId userId,
            SurveyRoundId roundId,
            SurveyRoundNumber roundNumber,
            SurveyContentVersionId contentVersionId,
            Instant submittedAt,
            List<SurveyAnswer> answers
    ) {
        return new SurveyResponse(
                id,
                userId,
                roundId,
                roundNumber,
                contentVersionId,
                submittedAt,
                answers);
    }

    public static Optional<SurveyResponse> latestOf(
            List<SurveyResponse> responses
    ) {
        Objects.requireNonNull(responses, "responses");
        if (responses.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "responses must not contain null");
        }
        return responses.stream()
                .max(Comparator.comparing(SurveyResponse::roundNumber));
    }

    public SurveyResponseId id() {
        return id;
    }

    public SurveyUserId userId() {
        return userId;
    }

    public SurveyRoundId roundId() {
        return roundId;
    }

    public SurveyRoundNumber roundNumber() {
        return roundNumber;
    }

    public SurveyContentVersionId contentVersionId() {
        return contentVersionId;
    }

    public Instant submittedAt() {
        return submittedAt;
    }

    public List<SurveyAnswer> answers() {
        return answers;
    }
}
