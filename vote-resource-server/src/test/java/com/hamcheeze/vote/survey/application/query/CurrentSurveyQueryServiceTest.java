package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.eligibility.SurveyRequirement;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CurrentSurveyQueryServiceTest {

    private static final SurveyUserId USER = new SurveyUserId("user-a");

    private final SurveyRoundRepository rounds = mock(
            SurveyRoundRepository.class);
    private final SurveyContentVersionRepository contents = mock(
            SurveyContentVersionRepository.class);
    private final SurveyResponseRepository responses = mock(
            SurveyResponseRepository.class);
    private final SurveyEligibilityQueryService eligibility =
            new SurveyEligibilityQueryService(
                    rounds,
                    responses,
                    Clock.fixed(
                            Instant.parse("2026-08-20T00:00:00Z"),
                            ZoneOffset.UTC));
    private final CurrentSurveyQueryService currentSurveys =
            new CurrentSurveyQueryService(
                    rounds, contents, responses, eligibility);

    @Test
    void usesOneResolvedRoundForEligibilityContentAndSubmission() {
        SurveyRoundId firstRoundId = new SurveyRoundId(UUID.randomUUID());
        SurveyRoundId secondRoundId = new SurveyRoundId(UUID.randomUUID());
        SurveyContentVersionId contentId =
                new SurveyContentVersionId(UUID.randomUUID());
        SurveyRound firstRound = round(firstRoundId, contentId);
        SurveyRound secondRound = round(
                secondRoundId,
                new SurveyContentVersionId(UUID.randomUUID()));
        SurveyContentVersion content = mock(SurveyContentVersion.class);
        when(rounds.findActive()).thenReturn(
                Optional.of(firstRound), Optional.of(secondRound));
        when(contents.findById(contentId)).thenReturn(Optional.of(content));
        when(responses.existsByUserIdAndRoundId(USER, firstRoundId))
                .thenReturn(true);

        CurrentSurveyQueryService.CurrentSurveyResult result =
                currentSurveys.findCurrent(USER);

        assertThat(result.current()).get().satisfies(current -> {
            assertThat(current.round()).isSameAs(firstRound);
            assertThat(current.contentVersion()).isSameAs(content);
            assertThat(current.submitted()).isTrue();
        });
        verify(rounds).findActive();
        verify(rounds, never()).findAll();
        verify(contents).findById(contentId);
        verify(responses, never()).existsByUserIdAndRoundId(
                USER, secondRoundId);
    }

    @Test
    void keepsUnavailableContractWhenNoRoundIsActive() {
        when(rounds.findActive()).thenReturn(Optional.empty());
        when(responses.existsByUserId(USER)).thenReturn(false);

        CurrentSurveyQueryService.CurrentSurveyResult result =
                currentSurveys.findCurrent(USER);

        assertThat(result.current()).isEmpty();
        verify(rounds).findActive();
        verify(rounds, never()).findAll();
        verify(contents, never()).findById(
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void previewUserAlwaysSeesCurrentSurveyAsNotSubmitted() {
        SurveyUserId previewUser = new SurveyUserId("local-user-1");
        SurveyPreviewMode previewMode =
                new SurveyPreviewMode("local-user-1");
        SurveyEligibilityQueryService previewEligibility =
                new SurveyEligibilityQueryService(
                        rounds,
                        responses,
                        previewMode,
                        Clock.fixed(
                                Instant.parse("2026-08-20T00:00:00Z"),
                                ZoneOffset.UTC));
        CurrentSurveyQueryService previewCurrent =
                new CurrentSurveyQueryService(
                        rounds,
                        contents,
                        responses,
                        previewEligibility,
                        previewMode);
        SurveyRoundId roundId = new SurveyRoundId(UUID.randomUUID());
        SurveyContentVersionId contentId =
                new SurveyContentVersionId(UUID.randomUUID());
        SurveyRound round = round(roundId, contentId);
        SurveyContentVersion content = mock(SurveyContentVersion.class);
        when(rounds.findActive()).thenReturn(Optional.of(round));
        when(contents.findById(contentId)).thenReturn(Optional.of(content));

        CurrentSurveyQueryService.CurrentSurveyResult result =
                previewCurrent.findCurrent(previewUser);

        assertThat(result.current()).get().satisfies(current ->
                assertThat(current.submitted()).isFalse());
        assertThat(result.eligibility().surveyRequirement())
                .isEqualTo(SurveyRequirement.REQUIRED);
        verify(responses, never()).existsByUserIdAndRoundId(
                previewUser, roundId);
        verify(responses, never()).existsByUserId(previewUser);
    }

    private static SurveyRound round(
            SurveyRoundId roundId,
            SurveyContentVersionId contentId
    ) {
        SurveyRound round = mock(SurveyRound.class);
        when(round.id()).thenReturn(roundId);
        when(round.contentVersionId()).thenReturn(contentId);
        when(round.status()).thenReturn(SurveyRoundStatus.ACTIVE);
        when(round.enforcementMode()).thenReturn(
                Optional.of(SurveyRoundEnforcementMode.REQUIRED));
        return round;
    }
}
