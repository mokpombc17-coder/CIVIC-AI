package com.hamcheeze.vote.survey.application.response;

import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyFixture;
import com.hamcheeze.vote.survey.application.idempotency.IdempotentSurveySubmissionExecutor;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseSubmittedEventPublisher;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SurveyResponseSubmissionServicePreviewTest {

    private static final SurveyUserId USER =
            new SurveyUserId("local-user-1");
    private static final Instant NOW =
            Instant.parse("2026-09-01T00:00:00Z");

    private final IdempotentSurveySubmissionExecutor idempotency =
            mock(IdempotentSurveySubmissionExecutor.class);
    private final SurveySubmissionOutcomeCodec outcomeCodec =
            mock(SurveySubmissionOutcomeCodec.class);
    private final SurveyRoundRepository rounds =
            mock(SurveyRoundRepository.class);
    private final SurveyContentVersionRepository contents =
            mock(SurveyContentVersionRepository.class);
    private final SurveyResponseRepository responses =
            mock(SurveyResponseRepository.class);
    private final SurveyResponseSubmittedEventPublisher submittedEvents =
            mock(SurveyResponseSubmittedEventPublisher.class);
    private final UserTransactionLock userTransactions =
            mock(UserTransactionLock.class);

    @Test
    void validatesAndAcceptsWithoutReceiptResponseOrEventPersistence() {
        var content = LocalSurveyFixture.publishedContent();
        SurveyRound round = SurveyRound.rehydrate(
                LocalSurveyFixture.ROUND_ID,
                LocalSurveyFixture.ROUND_NUMBER,
                LocalSurveyFixture.CONTENT_VERSION_ID,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                LocalSurveyFixture.CREATED_AT,
                null,
                null,
                null,
                LocalSurveyFixture.ACTOR,
                LocalSurveyFixture.CREATED_AT,
                0);
        when(rounds.findActive()).thenReturn(Optional.of(round));
        when(contents.findById(LocalSurveyFixture.CONTENT_VERSION_ID))
                .thenReturn(Optional.of(content));
        SurveyResponseSubmissionService service =
                new SurveyResponseSubmissionService(
                        idempotency,
                        outcomeCodec,
                        rounds,
                        contents,
                        responses,
                        submittedEvents,
                        userTransactions,
                        Clock.fixed(NOW, ZoneOffset.UTC));
        UUID idempotencyKey = UUID.randomUUID();

        SurveyResponseSubmissionService.SubmissionExecution execution =
                service.submitPreview(
                        USER,
                        idempotencyKey.toString(),
                        new SurveyResponseSubmissionService
                                .SubmitSurveyResponseCommand(
                                round.id(),
                                content.questions().stream()
                                        .map(SurveyResponseSubmissionServicePreviewTest
                                                ::validAnswer)
                                        .toList()));

        assertThat(execution.replayed()).isFalse();
        assertThat(execution.outcome().httpStatus()).isEqualTo(200);
        assertThat(execution.outcome().code())
                .isEqualTo("SURVEY_RESPONSE_SUBMITTED");
        assertThat(execution.outcome().responseId().value())
                .isEqualTo(idempotencyKey);
        assertThat(execution.outcome().roundId()).isEqualTo(round.id());
        verifyNoInteractions(
                idempotency,
                outcomeCodec,
                responses,
                submittedEvents,
                userTransactions);
    }

    private static SurveyAnswer validAnswer(SurveyQuestion question) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> new SingleChoiceAnswer(
                    question.id(),
                    new OptionSelection(
                            question.options().getFirst().id(), null));
            case MULTIPLE_CHOICE -> {
                MultipleChoiceRule rule =
                        (MultipleChoiceRule) question.rule();
                yield new MultipleChoiceAnswer(
                        question.id(),
                        question.options().stream()
                                .limit(rule.minimumSelections())
                                .map(option -> new OptionSelection(
                                        option.id(), null))
                                .toList());
            }
            case SHORT_TEXT -> new ShortTextAnswer(
                    question.id(), "응답");
            case LONG_TEXT -> new LongTextAnswer(
                    question.id(), "응답");
            case NUMBER -> new NumberAnswer(
                    question.id(),
                    ((NumberRule) question.rule()).minimum());
            case SCALE -> new ScaleAnswer(
                    question.id(),
                    ((ScaleRule) question.rule()).minimum());
        };
    }
}
