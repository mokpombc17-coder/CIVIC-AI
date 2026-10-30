package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityContext;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityPolicy;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class SurveyEligibilityQueryService {

    private final SurveyRoundRepository rounds;
    private final SurveyResponseRepository responses;
    private final SurveyPreviewMode previewMode;
    private final ServiceEligibilityPolicy policy =
            new ServiceEligibilityPolicy();
    private final Clock clock;

    @Autowired
    public SurveyEligibilityQueryService(
            SurveyRoundRepository rounds,
            SurveyResponseRepository responses,
            SurveyPreviewMode previewMode
    ) {
        this(rounds, responses, previewMode, Clock.systemUTC());
    }

    SurveyEligibilityQueryService(
            SurveyRoundRepository rounds,
            SurveyResponseRepository responses,
            Clock clock
    ) {
        this(rounds, responses, SurveyPreviewMode.disabled(), clock);
    }

    SurveyEligibilityQueryService(
            SurveyRoundRepository rounds,
            SurveyResponseRepository responses,
            SurveyPreviewMode previewMode,
            Clock clock
    ) {
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.responses = Objects.requireNonNull(responses, "responses");
        this.previewMode = Objects.requireNonNull(
                previewMode, "previewMode");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public ServiceEligibilityDecision evaluate(SurveyUserId userId) {
        Objects.requireNonNull(userId, "userId");
        List<SurveyRound> activeCandidates = rounds.findAll().stream()
                .filter(round -> round.status() == SurveyRoundStatus.ACTIVE)
                .toList();
        return evaluate(userId, activeCandidates);
    }

    ServiceEligibilityDecision evaluate(
            SurveyUserId userId,
            Optional<SurveyRound> activeRound
    ) {
        Objects.requireNonNull(activeRound, "activeRound");
        return evaluate(userId, activeRound.stream().toList());
    }

    private ServiceEligibilityDecision evaluate(
            SurveyUserId userId,
            List<SurveyRound> activeCandidates
    ) {
        Objects.requireNonNull(userId, "userId");
        boolean preview = previewMode.enabledFor(userId);
        boolean currentResponse = !preview
                && activeCandidates.size() == 1
                && responses.existsByUserIdAndRoundId(
                        userId, activeCandidates.getFirst().id());
        boolean priorResponse = !preview
                && responses.existsByUserId(userId)
                && !currentResponse;
        return policy.evaluate(new ServiceEligibilityContext(
                userId,
                activeCandidates,
                currentResponse,
                priorResponse,
                clock.instant()));
    }
}
