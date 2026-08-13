package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SurveyRoundRepository {

    SurveyRound save(SurveyRound round);

    Optional<SurveyRound> findById(SurveyRoundId roundId);

    Optional<SurveyRound> findActive();

    Optional<SurveyRound> findScheduled();

    List<SurveyRound> findScheduledDueAt(Instant dueAt);

    List<SurveyRound> findAll();

    long lockGlobalControlForUpdate();

    Optional<SurveyRound> findByIdForShare(SurveyRoundId roundId);

    List<SurveyRound> findByIdsForUpdate(List<SurveyRoundId> roundIds);

    void appendTransitions(List<SurveyRoundTransition> transitions);

    List<SurveyRoundTransition> findTransitions(SurveyRoundId roundId);
}
