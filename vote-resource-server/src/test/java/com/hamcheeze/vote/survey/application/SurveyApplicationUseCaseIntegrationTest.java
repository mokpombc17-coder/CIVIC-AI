package com.hamcheeze.vote.survey.application;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDeliveryService;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import com.hamcheeze.vote.survey.application.query.CurrentSurveyQueryService;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.survey.application.query.MySurveyResponseQueryService;
import com.hamcheeze.vote.survey.application.query.SurveyEligibilityQueryService;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.response.SurveySubmissionOutcome;
import com.hamcheeze.vote.survey.application.round.SurveyRoundService;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.eligibility.SurveyRequirement;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
class SurveyApplicationUseCaseIntegrationTest {

    private static final SurveyActorId ADMIN =
            new SurveyActorId("local-admin");
    private static final SurveyUserId USER =
            new SurveyUserId("survey-user-1");
    private static final PersonaUserId PERSONA_USER =
            new PersonaUserId(USER.value());

    @Autowired
    private SurveyContentVersionService contentService;

    @Autowired
    private SurveyRoundService roundService;

    @Autowired
    private CurrentSurveyQueryService currentSurveyQuery;

    @Autowired
    private SurveyEligibilityQueryService eligibilityQuery;

    @Autowired
    private CurrentPersonaQueryService currentPersonaQuery;

    @Autowired
    private MySurveyResponseQueryService myResponseQuery;

    @Autowired
    private PersonaSurveySourceQueryPort personaSurveySourceQuery;

    @Autowired
    private PersonaGenerationRepository personaGenerations;

    @Autowired
    private PersonaVersionRepository personaVersions;

    @Autowired
    private IntegrationOutboxDeliveryService outboxDeliveries;

    @Autowired
    private SurveyResponseSubmissionService submissionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    integration_outbox,
                    persona_inbox,
                    persona_generations,
                    survey_content_versions,
                    survey_round_control
                CASCADE
                """);
        jdbcTemplate.update("""
                INSERT INTO survey_round_control (control_id, row_version)
                VALUES ('GLOBAL', 0)
                """);
    }

    @AfterEach
    void cleanSurveyData() {
        resetSurveyData();
    }

    @Test
    void contentRoundSubmissionAndOwnQueriesFormOneUseCaseFlow() {
        PublishedContent content = publishContent("첫 사용자 특성 설문");
        SurveyRound active = roundService.startPublishedContentNow(
                        content.value().id(), "local bootstrap", ADMIN)
                .targetRound();

        var before = currentSurveyQuery.findCurrent(USER);
        assertThat(before).isPresent();
        assertThat(before.orElseThrow().submitted()).isFalse();
        assertThat(eligibilityQuery.evaluate(USER).eligible()).isFalse();
        assertThat(eligibilityQuery.evaluate(USER).surveyRequirement())
                .isEqualTo(SurveyRequirement.REQUIRED);

        String idempotencyKey = UUID.randomUUID().toString();
        var command = new SurveyResponseSubmissionService
                .SubmitSurveyResponseCommand(
                active.id(),
                List.of(new ShortTextAnswer(
                        content.question().id(), "  차분하고 탐구적  ")));
        var submitted = submissionService.submit(
                USER, idempotencyKey, command);

        assertThat(submitted.replayed()).isFalse();
        assertThat(submitted.outcome().succeeded()).isTrue();
        assertThat(submitted.outcome().submittedEvent()).isPresent();
        assertThat(personaGenerations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(
                        submitted.outcome().responseId().value()))).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM integration_outbox",
                Integer.class)).isEqualTo(1);
        assertThat(currentPersonaQuery.findCurrent(PERSONA_USER))
                .satisfies(currentPersona -> {
                    assertThat(currentPersona.personaReady()).isFalse();
                    assertThat(currentPersona.sourceResponseId())
                            .contains(new PersonaSourceId(
                                    submitted.outcome().responseId().value()));
                    assertThat(currentPersona.status().name())
                            .isEqualTo("GENERATION_MISSING");
                });

        assertThat(outboxDeliveries.deliverNext()).isTrue();

        assertThat(personaGenerations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(
                        submitted.outcome().responseId().value())))
                .get()
                .satisfies(generation -> {
                    assertThat(generation.status().name())
                            .isEqualTo("PENDING");
                    assertThat(generation.attemptCount()).isZero();
                });
        var firstGeneration = personaGenerations
                .findBySource(
                        PersonaSourceType.SURVEY_RESPONSE,
                        new PersonaSourceId(
                        submitted.outcome().responseId().value()))
                .orElseThrow();
        PersonaGenerationClaimToken claimToken =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        firstGeneration.claim(
                claimToken,
                firstGeneration.createdAt().plusSeconds(1),
                firstGeneration.createdAt().plusSeconds(61));
        firstGeneration.succeed(
                claimToken,
                new PersonaId("persona-first"),
                firstGeneration.createdAt().plusSeconds(2));
        personaGenerations.save(firstGeneration);
        personaVersions.insert(new PersonaVersion(
                new PersonaVersionId(UUID.randomUUID()),
                firstGeneration.id(),
                PERSONA_USER,
                firstGeneration.personaId().orElseThrow(),
                new PredictedAdoptionRate(new BigDecimal("0.5")),
                new PersonaModelVersion("test-model-v1"),
                firstGeneration.createdAt().plusSeconds(2),
                PersonaSourceType.SURVEY_RESPONSE,
                firstGeneration.sourceId()));
        assertThat(currentPersonaQuery.findCurrent(PERSONA_USER).personaReady())
                .isTrue();

        var replayed = submissionService.submit(
                USER, idempotencyKey, command);
        assertThat(replayed.replayed()).isTrue();
        assertThat(replayed.outcome()).isEqualTo(submitted.outcome());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM persona_generations",
                Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM integration_outbox",
                Integer.class)).isEqualTo(1);

        var duplicate = submissionService.submit(
                USER, UUID.randomUUID().toString(), command);
        assertThat(duplicate.outcome().httpStatus()).isEqualTo(409);
        assertThat(duplicate.outcome().code())
                .isEqualTo("CURRENT_SURVEY_ALREADY_SUBMITTED");

        var after = currentSurveyQuery.findCurrent(USER);
        assertThat(after.orElseThrow().submitted()).isTrue();
        assertThat(eligibilityQuery.evaluate(USER).eligible()).isTrue();
        assertThat(eligibilityQuery.evaluate(USER).surveyRequirement())
                .isEqualTo(SurveyRequirement.SATISFIED);
        assertThat(myResponseQuery.findLatest(USER)).isPresent();
        assertThat(myResponseQuery.findHistory(USER)).hasSize(1);
        assertThat(myResponseQuery.findDetail(
                USER, submitted.outcome().responseId())).isPresent();
        assertThat(myResponseQuery.findDetail(
                new SurveyUserId("another-user"),
                submitted.outcome().responseId())).isEmpty();
        var personaSource = personaSurveySourceQuery.getByResponseId(
                new PersonaSourceId(
                        submitted.outcome().responseId().value()));
        assertThat(personaSurveySourceQuery.getByResponseId(
                new PersonaSourceId(
                        submitted.outcome().responseId().value())))
                .isEqualTo(personaSource);
        assertThat(personaSource.userId().value()).isEqualTo(USER.value());
        assertThat(personaSource.answers()).hasSize(1);
        assertThat(personaSource.answers().getFirst().question().prompt())
                .isEqualTo("자신을 한 문장으로 표현해주세요.");

        PublishedContent nextContent = publishContent("두 번째 사용자 특성 설문");
        SurveyRound nextRound = roundService.startPublishedContentNow(
                        nextContent.value().id(), "next round", ADMIN)
                .targetRound();
        var advisory = eligibilityQuery.evaluate(USER);
        assertThat(advisory.eligible()).isTrue();
        assertThat(advisory.surveyRequirement())
                .isEqualTo(SurveyRequirement.RECOMMENDED);

        roundService.changeEnforcement(
                nextRound.id(),
                SurveyRoundEnforcementMode.REQUIRED,
                "required",
                ADMIN);
        assertThat(eligibilityQuery.evaluate(USER).eligible()).isFalse();

        SurveySubmissionOutcome nextSubmitted = submit(
                nextRound, nextContent);
        assertThat(nextSubmitted.succeeded()).isTrue();
        assertThat(personaGenerations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(
                        nextSubmitted.responseId().value()))).isEmpty();
        assertThat(outboxDeliveries.deliverNext()).isTrue();
        assertThat(eligibilityQuery.evaluate(USER).eligible()).isTrue();
        assertThat(myResponseQuery.findLatest(USER).orElseThrow().id())
                .isEqualTo(nextSubmitted.responseId());
        assertThat(myResponseQuery.findHistory(USER)).hasSize(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM persona_generations",
                Integer.class)).isEqualTo(2);
        assertThat(currentPersonaQuery.findCurrent(PERSONA_USER))
                .satisfies(currentPersona -> {
                    assertThat(currentPersona.personaReady()).isFalse();
                    assertThat(currentPersona.sourceResponseId())
                            .contains(new PersonaSourceId(
                                    nextSubmitted.responseId().value()));
                    assertThat(currentPersona.status().name())
                            .isEqualTo("PENDING");
                });

        var restoredFirst = personaSurveySourceQuery.getByResponseId(
                new PersonaSourceId(
                        submitted.outcome().responseId().value()));
        assertThat(restoredFirst.contentVersionId())
                .isEqualTo(content.value().id().value());
        assertThat(restoredFirst.answers().getFirst().question().prompt())
                .isEqualTo("자신을 한 문장으로 표현해주세요.");
        assertThat(restoredFirst.answers().getFirst().value())
                .isInstanceOf(com.hamcheeze.vote.persona.application
                        .PersonaSurveySource.TextValue.class);
    }

    @Test
    void contentAdministrationSupportsReplacePublishCloneListAndDetail() {
        SurveyQuestion originalQuestion = shortTextQuestion("초안 질문");
        SurveyContentVersion draft = contentService.createDraft(
                new SurveyContentVersionService.CreateDraftCommand(
                        "초안", null, List.of(originalQuestion)),
                ADMIN);
        SurveyQuestion replacedQuestion = shortTextQuestion("교체 질문");

        SurveyContentVersion replaced = contentService.replaceDraft(
                draft.id(),
                new SurveyContentVersionService.ReplaceDraftCommand(
                        "교체된 초안",
                        "전체 교체",
                        List.of(replacedQuestion)),
                ADMIN);
        SurveyContentVersion published = contentService.publish(
                replaced.id(), ADMIN).contentVersion();
        SurveyContentVersion clone = contentService
                .clonePublishedVersion(published.id(), ADMIN);

        assertThat(published.versionNumber()).isPresent();
        assertThat(clone.id()).isNotEqualTo(published.id());
        assertThat(clone.derivedFromContentVersionId())
                .contains(published.id());
        assertThat(clone.questions().getFirst().id())
                .isNotEqualTo(published.questions().getFirst().id());
        assertThat(clone.questions().getFirst().lineageKey())
                .isEqualTo(published.questions().getFirst().lineageKey());
        assertThat(contentService.findAll()).hasSize(2);
        assertThat(contentService.findById(clone.id()))
                .map(SurveyContentVersion::id)
                .contains(clone.id());
    }

    @Test
    void scheduledRoundCanBeRescheduledAndCanceledWithHistory() {
        PublishedContent content = publishContent("예약 관리");
        SurveyRound scheduled = roundService.schedule(
                        content.value().id(),
                        Instant.now().plusSeconds(3600),
                        "initial",
                        ADMIN)
                .round();

        SurveyRound rescheduled = roundService.reschedule(
                        scheduled.id(),
                        Instant.now().plusSeconds(7200),
                        "changed",
                        ADMIN)
                .round();
        SurveyRound canceled = roundService.cancel(
                        rescheduled.id(), "not needed", ADMIN)
                .round();

        assertThat(canceled.status()).isEqualTo(SurveyRoundStatus.CANCELED);
        assertThat(roundService.findTransitions(canceled.id())).hasSize(3);
        assertThat(roundService.findAll())
                .extracting(SurveyRound::id)
                .contains(canceled.id());
    }

    @Test
    void nextRoundStartsAdvisoryAndCanBeChangedToRequired() {
        PublishedContent first = publishContent("첫 회차");
        SurveyRound firstRound = roundService.startPublishedContentNow(
                        first.value().id(), null, ADMIN)
                .targetRound();
        submit(firstRound, first);

        PublishedContent second = publishContent("두 번째 회차");
        SurveyRound scheduled = roundService.schedule(
                        second.value().id(),
                        Instant.now().plusSeconds(3600),
                        "next round",
                        ADMIN)
                .round();
        SurveyRound secondRound = roundService.startScheduledRoundNow(
                        scheduled.id(), "manual activation", ADMIN)
                .targetRound();

        assertThat(secondRound.status()).isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(secondRound.enforcementMode())
                .contains(SurveyRoundEnforcementMode.ADVISORY);
        assertThat(eligibilityQuery.evaluate(USER).eligible()).isTrue();
        assertThat(eligibilityQuery.evaluate(USER).surveyRequirement())
                .isEqualTo(SurveyRequirement.RECOMMENDED);

        roundService.changeEnforcement(
                secondRound.id(),
                SurveyRoundEnforcementMode.REQUIRED,
                "mandatory now",
                ADMIN);

        assertThat(eligibilityQuery.evaluate(USER).eligible()).isFalse();
        assertThat(eligibilityQuery.evaluate(USER).surveyRequirement())
                .isEqualTo(SurveyRequirement.REQUIRED);
        assertThat(roundService.findTransitions(secondRound.id()))
                .hasSize(3);
        assertThat(roundService.findById(firstRound.id()).orElseThrow()
                .status()).isEqualTo(SurveyRoundStatus.CLOSED);
    }

    @Test
    void differentIdempotencyKeysStillCreateOnlyOneFinalResponse()
            throws Exception {
        PublishedContent content = publishContent("동시 제출 검증");
        SurveyRound active = roundService.startPublishedContentNow(
                        content.value().id(), null, ADMIN)
                .targetRound();
        var command = new SurveyResponseSubmissionService
                .SubmitSurveyResponseCommand(
                active.id(),
                List.of(new ShortTextAnswer(
                        content.question().id(), "동일한 최종 답변")));
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<SurveySubmissionOutcome> first = executor.submit(() -> {
                start.await();
                return submissionService.submit(
                                USER, UUID.randomUUID().toString(), command)
                        .outcome();
            });
            Future<SurveySubmissionOutcome> second = executor.submit(() -> {
                start.await();
                return submissionService.submit(
                                USER, UUID.randomUUID().toString(), command)
                        .outcome();
            });
            start.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .extracting(SurveySubmissionOutcome::code)
                    .containsExactlyInAnyOrder(
                            "SURVEY_RESPONSE_SUBMITTED",
                            "CURRENT_SURVEY_ALREADY_SUBMITTED");
        }
        assertThat(myResponseQuery.findHistory(USER)).hasSize(1);
    }

    @Test
    void concurrentScheduledRoundStartsHaveOneTransitionWinner()
            throws Exception {
        PublishedContent content = publishContent("예약 회차 경쟁 검증");
        SurveyRound scheduled = roundService.schedule(
                        content.value().id(),
                        Instant.now().plusSeconds(3600),
                        null,
                        ADMIN)
                .round();
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> first = executor.submit(() -> {
                start.await();
                return roundService.startScheduledRoundNow(
                        scheduled.id(), null, ADMIN).changed();
            });
            Future<Boolean> second = executor.submit(() -> {
                start.await();
                return roundService.startScheduledRoundNow(
                        scheduled.id(), null, ADMIN).changed();
            });
            start.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(roundService.findById(scheduled.id()).orElseThrow()
                .status()).isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(roundService.findTransitions(scheduled.id())).hasSize(2);
    }

    private SurveySubmissionOutcome submit(
            SurveyRound round,
            PublishedContent content
    ) {
        return submissionService.submit(
                        USER,
                        UUID.randomUUID().toString(),
                        new SurveyResponseSubmissionService
                                .SubmitSurveyResponseCommand(
                                round.id(),
                                List.of(new ShortTextAnswer(
                                        content.question().id(), "답변"))))
                .outcome();
    }

    private PublishedContent publishContent(String name) {
        SurveyQuestion question = shortTextQuestion(
                "자신을 한 문장으로 표현해주세요.");
        SurveyContentVersion draft = contentService.createDraft(
                new SurveyContentVersionService.CreateDraftCommand(
                        name, null, List.of(question)),
                ADMIN);
        SurveyContentVersion published = contentService.publish(
                draft.id(), ADMIN).contentVersion();
        return new PublishedContent(published, question);
    }

    private static SurveyQuestion shortTextQuestion(String prompt) {
        return new SurveyQuestion(
                new SurveyQuestionId(UUID.randomUUID()),
                new SurveyQuestionLineageKey(UUID.randomUUID()),
                SurveyQuestionType.SHORT_TEXT,
                prompt,
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());
    }

    private record PublishedContent(
            SurveyContentVersion value,
            SurveyQuestion question
    ) {
    }
}
