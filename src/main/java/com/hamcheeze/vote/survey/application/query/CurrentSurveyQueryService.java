package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Objects;
import java.util.Optional;

@Service
public class CurrentSurveyQueryService {

    private final SurveyRoundRepository rounds;
    private final SurveyContentVersionRepository contents;
    private final SurveyResponseRepository responses;
    private final SurveyPreviewMode previewMode;

    @Autowired
    public CurrentSurveyQueryService(
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            SurveyResponseRepository responses,
            SurveyPreviewMode previewMode
    ) {
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.contents = Objects.requireNonNull(contents, "contents");
        this.responses = Objects.requireNonNull(responses, "responses");
        this.previewMode = Objects.requireNonNull(
                previewMode, "previewMode");
    }

    CurrentSurveyQueryService(
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            SurveyResponseRepository responses
    ) {
        this(rounds, contents, responses, SurveyPreviewMode.disabled());
    }

    @Transactional(readOnly = true)
    public Optional<CurrentSurvey> findCurrent(SurveyUserId userId) {
        Objects.requireNonNull(userId, "userId");
        Optional<SurveyRound> activeRound = rounds.findActive();
        return activeRound.map(round -> {
            SurveyContentVersion content = contents
                    .findById(round.contentVersionId())
                    .orElseThrow(() -> SurveyDomainException.invariant(
                            "SURVEY_ACTIVE_CONTENT_NOT_FOUND",
                            "contentVersionId",
                            "active round content version does not exist"));
            return new CurrentSurvey(
                    round,
                    content,
                    previewMode.enabledFor(userId)
                            ? Optional.empty()
                            : responses.findByUserIdAndRoundId(
                                    userId, round.id()));
        });
    }

    public record CurrentSurvey(
            SurveyRound round,
            SurveyContentVersion contentVersion,
            Optional<SurveyResponse> submittedResponse
    ) {
        public CurrentSurvey {
            Objects.requireNonNull(round, "round");
            Objects.requireNonNull(contentVersion, "contentVersion");
            submittedResponse = Objects.requireNonNull(
                    submittedResponse, "submittedResponse");
        }

        public boolean submitted() {
            return submittedResponse.isPresent();
        }
    }

}
