package com.hamcheeze.vote.survey.application.round;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationPlan;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

@Component
public class SurveyRoundActivationJob {

    private static final SurveyActorId SCHEDULER_ACTOR =
            new SurveyActorId("SYSTEM:SURVEY_SCHEDULER");

    private final SurveyRoundService roundService;

    public SurveyRoundActivationJob(SurveyRoundService roundService) {
        this.roundService = Objects.requireNonNull(
                roundService, "roundService");
    }

    public List<SurveyRoundActivationPlan> activateDueRounds() {
        return roundService.findDueRounds().stream()
                .map(round -> roundService.activateDueRound(
                        round.id(), SCHEDULER_ACTOR))
                .toList();
    }
}
