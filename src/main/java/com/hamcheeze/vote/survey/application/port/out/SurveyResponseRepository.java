package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;

import java.util.List;
import java.util.Optional;

public interface SurveyResponseRepository {

    SurveyResponse insert(SurveyResponse response);

    boolean existsByUserIdAndRoundId(
            SurveyUserId userId,
            SurveyRoundId roundId);

    default Optional<SurveyResponse> findByUserIdAndRoundId(
            SurveyUserId userId,
            SurveyRoundId roundId
    ) {
        return findAllByUserId(userId).stream()
                .filter(response -> response.roundId().equals(roundId))
                .findFirst();
    }

    Optional<SurveyResponse> findById(SurveyResponseId responseId);

    Optional<SurveyResponse> findByIdAndUserId(
            SurveyResponseId responseId,
            SurveyUserId userId);

    boolean existsByUserId(SurveyUserId userId);

    Optional<SurveyResponse> findLatestByUserId(SurveyUserId userId);

    List<SurveyResponse> findAllByUserId(SurveyUserId userId);
}
