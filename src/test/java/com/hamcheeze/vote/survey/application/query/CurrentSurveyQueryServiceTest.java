package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.Test;

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
    private final CurrentSurveyQueryService currentSurveys =
            new CurrentSurveyQueryService(
                    rounds, contents, responses);

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
        SurveyResponse submittedResponse = mock(SurveyResponse.class);
        when(rounds.findActive()).thenReturn(
                Optional.of(firstRound), Optional.of(secondRound));
        when(contents.findById(contentId)).thenReturn(Optional.of(content));
        when(responses.findByUserIdAndRoundId(USER, firstRoundId))
                .thenReturn(Optional.of(submittedResponse));

        Optional<CurrentSurveyQueryService.CurrentSurvey> result =
                currentSurveys.findCurrent(USER);

        assertThat(result).get().satisfies(current -> {
            assertThat(current.round()).isSameAs(firstRound);
            assertThat(current.contentVersion()).isSameAs(content);
            assertThat(current.submitted()).isTrue();
            assertThat(current.submittedResponse())
                    .containsSame(submittedResponse);
        });
        verify(rounds).findActive();
        verify(rounds, never()).findAll();
        verify(contents).findById(contentId);
        verify(responses, never()).findByUserIdAndRoundId(
                USER, secondRoundId);
    }

    @Test
    void keepsUnavailableContractWhenNoRoundIsActive() {
        when(rounds.findActive()).thenReturn(Optional.empty());
        Optional<CurrentSurveyQueryService.CurrentSurvey> result =
                currentSurveys.findCurrent(USER);

        assertThat(result).isEmpty();
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
        CurrentSurveyQueryService previewCurrent =
                new CurrentSurveyQueryService(
                        rounds,
                        contents,
                        responses,
                        previewMode);
        SurveyRoundId roundId = new SurveyRoundId(UUID.randomUUID());
        SurveyContentVersionId contentId =
                new SurveyContentVersionId(UUID.randomUUID());
        SurveyRound round = round(roundId, contentId);
        SurveyContentVersion content = mock(SurveyContentVersion.class);
        when(rounds.findActive()).thenReturn(Optional.of(round));
        when(contents.findById(contentId)).thenReturn(Optional.of(content));

        Optional<CurrentSurveyQueryService.CurrentSurvey> result =
                previewCurrent.findCurrent(previewUser);

        assertThat(result).get().satisfies(current ->
                assertThat(current.submitted()).isFalse());
        verify(responses, never()).findByUserIdAndRoundId(
                previewUser, roundId);
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
