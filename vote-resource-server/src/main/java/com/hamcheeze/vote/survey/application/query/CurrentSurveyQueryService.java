package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

@Service
public class CurrentSurveyQueryService {

    private final SurveyRoundRepository rounds;
    private final SurveyContentVersionRepository contents;
    private final SurveyResponseRepository responses;
    private final SurveyEligibilityQueryService eligibility;

    public CurrentSurveyQueryService(
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            SurveyResponseRepository responses,
            SurveyEligibilityQueryService eligibility
    ) {
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.contents = Objects.requireNonNull(contents, "contents");
        this.responses = Objects.requireNonNull(responses, "responses");
        this.eligibility = Objects.requireNonNull(
                eligibility, "eligibility");
    }

    @Transactional(readOnly = true)
    public CurrentSurveyResult findCurrent(SurveyUserId userId) {
        Objects.requireNonNull(userId, "userId");
        ServiceEligibilityDecision decision = eligibility.evaluate(userId);
        Optional<CurrentSurvey> current = rounds.findActive().map(round -> {
            SurveyContentVersion content = contents
                    .findById(round.contentVersionId())
                    .orElseThrow(() -> SurveyDomainException.invariant(
                            "SURVEY_ACTIVE_CONTENT_NOT_FOUND",
                            "contentVersionId",
                            "active round content version does not exist"));
            return new CurrentSurvey(
                    round,
                    content,
                    responses.existsByUserIdAndRoundId(userId, round.id()));
        });
        return new CurrentSurveyResult(current, decision);
    }

    public record CurrentSurvey(
            SurveyRound round,
            SurveyContentVersion contentVersion,
            boolean submitted
    ) {
        public CurrentSurvey {
            Objects.requireNonNull(round, "round");
            Objects.requireNonNull(contentVersion, "contentVersion");
        }
    }

    public record CurrentSurveyResult(
            Optional<CurrentSurvey> current,
            ServiceEligibilityDecision eligibility
    ) {
        public CurrentSurveyResult {
            current = Objects.requireNonNull(current, "current");
            Objects.requireNonNull(eligibility, "eligibility");
        }
    }
}
