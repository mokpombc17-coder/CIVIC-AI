package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.query.CurrentSurveyQueryService;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.query.MySurveyResponseQueryService;
import com.hamcheeze.vote.survey.application.query.SurveyEligibilityQueryService;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyFixture;
import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.response.SurveySubmissionOutcome;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SurveyUserControllerTest {

    private final AuthenticatedUserIdResolver userIds =
            mock(AuthenticatedUserIdResolver.class);
    private final CurrentSurveyQueryService currentSurveys =
            mock(CurrentSurveyQueryService.class);
    private final SurveyResponseSubmissionService submissions =
            mock(SurveyResponseSubmissionService.class);
    private final MySurveyResponseQueryService responses =
            mock(MySurveyResponseQueryService.class);
    private final SurveyEligibilityQueryService eligibility =
            mock(SurveyEligibilityQueryService.class);
    private final Authentication authentication = mock(Authentication.class);
    private final SurveyContentVersionService contents =
            mock(SurveyContentVersionService.class);
    private final SurveyPreviewMode previewMode =
            mock(SurveyPreviewMode.class);

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("user-a");
        mockMvc = MockMvcBuilders.standaloneSetup(new SurveyUserController(
                        userIds,
                        currentSurveys,
                        submissions,
                        responses,
                        eligibility,
                        contents,
                        previewMode,
                        Optional.of(new LocalSurveyEligibilityFixture(
                                previewMode))))
                .setControllerAdvice(new SurveyApiExceptionHandler())
                .build();
    }

    @Test
    void activeRoundAbsenceReturnsCurrentSurveyNotFound() throws Exception {
        when(currentSurveys.findCurrent(any())).thenReturn(
                Optional.empty());

        mockMvc.perform(get("/api/v1/me/surveys/current")
                        .principal(authentication))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_ACTIVE_ROUND_UNAVAILABLE"));
    }

    @Test
    void pendingCurrentSurveyReturnsOnlyFrontendReadModel() throws Exception {
        var publishedContent = LocalSurveyFixture.publishedContent();
        SurveyRound round = mock(SurveyRound.class);
        when(round.id()).thenReturn(new SurveyRoundId(UUID.randomUUID()));
        when(round.contentVersionId())
                .thenReturn(publishedContent.id());
        when(currentSurveys.findCurrent(any())).thenReturn(
                Optional.of(new CurrentSurveyQueryService.CurrentSurvey(
                        round, publishedContent, Optional.empty())));

        mockMvc.perform(get("/api/v1/me/surveys/current")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.roundId")
                        .value(round.id().value().toString()))
                .andExpect(jsonPath("$.contentVersionId")
                        .value(publishedContent.id().value().toString()))
                .andExpect(jsonPath("$.sections.length()").value(7))
                .andExpect(jsonPath("$.content").doesNotExist())
                .andExpect(jsonPath("$.submitted").doesNotExist())
                .andExpect(jsonPath("$.eligibility").doesNotExist());
    }

    @Test
    void submittedCurrentSurveyOmitsSurveyContent() throws Exception {
        var publishedContent = LocalSurveyFixture.publishedContent();
        SurveyRound round = mock(SurveyRound.class);
        SurveyResponse response = mock(SurveyResponse.class);
        SurveyResponseId responseId = new SurveyResponseId(UUID.randomUUID());
        Instant submittedAt = Instant.parse("2026-09-01T00:00:00Z");
        when(round.id()).thenReturn(new SurveyRoundId(UUID.randomUUID()));
        when(round.contentVersionId()).thenReturn(publishedContent.id());
        when(response.id()).thenReturn(responseId);
        when(response.contentVersionId()).thenReturn(publishedContent.id());
        when(response.submittedAt()).thenReturn(submittedAt);
        when(currentSurveys.findCurrent(any())).thenReturn(
                Optional.of(new CurrentSurveyQueryService.CurrentSurvey(
                        round, publishedContent, Optional.of(response))));

        mockMvc.perform(get("/api/v1/me/surveys/current")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.responseId")
                        .value(responseId.value().toString()))
                .andExpect(jsonPath("$.submittedAt")
                        .value("2026-09-01T00:00:00Z"))
                .andExpect(jsonPath("$.sections").doesNotExist())
                .andExpect(jsonPath("$.content").doesNotExist());
    }

    @Test
    void responseDetailIsAlwaysScopedToAuthenticatedSubject()
            throws Exception {
        UUID responseId = UUID.randomUUID();
        when(responses.findDetail(any(), any())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/me/survey-responses/{responseId}",
                        responseId).principal(authentication))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("SURVEY_RESPONSE_NOT_FOUND"));

        verify(responses).findDetail(
                eq(new com.hamcheeze.vote.survey.domain.common
                        .SurveyUserId("user-a")),
                eq(new SurveyResponseId(responseId)));
    }

    @Test
    void localPreviewUserIsEligibleWithoutPersistedResponse()
            throws Exception {
        SurveyUserId userId = new SurveyUserId("user-a");
        SurveyRoundId roundId = new SurveyRoundId(UUID.randomUUID());
        Instant evaluatedAt = Instant.parse("2026-09-07T00:00:00Z");
        ServiceEligibilityDecision decision =
                mock(ServiceEligibilityDecision.class);
        when(previewMode.enabledFor(userId)).thenReturn(true);
        when(eligibility.evaluate(userId)).thenReturn(decision);
        when(decision.activeRoundId()).thenReturn(Optional.of(roundId));
        when(decision.evaluatedAt()).thenReturn(evaluatedAt);

        mockMvc.perform(get("/api/v1/me/service-eligibility")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(true))
                .andExpect(jsonPath("$.surveyRequirement")
                        .value("SATISFIED"))
                .andExpect(jsonPath("$.reason").doesNotExist())
                .andExpect(jsonPath("$.nextAction").doesNotExist())
                .andExpect(jsonPath("$.activeRoundId")
                        .value(roundId.value().toString()))
                .andExpect(jsonPath("$.evaluatedAt")
                        .value("2026-09-07T00:00:00Z"))
                .andExpect(jsonPath("$.capabilities.length()").value(1))
                .andExpect(jsonPath("$.capabilities[0]")
                        .value("USE_GENERAL_SERVICE"));
    }

    @Test
    void successfulReplayIsExposedInResponseBody() throws Exception {
        UUID roundId = UUID.randomUUID();
        UUID consentReceiptId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        UUID contentId = UUID.randomUUID();
        SurveySubmissionOutcome outcome = new SurveySubmissionOutcome(
                201,
                "SURVEY_RESPONSE_SUBMITTED",
                new SurveyResponseId(responseId),
                new SurveyRoundId(roundId),
                new SurveyContentVersionId(contentId),
                Instant.parse("2026-08-13T00:00:00Z"),
                List.of());
        when(submissions.submit(any(), eq("request-key"), any()))
                .thenReturn(new SurveyResponseSubmissionService
                        .SubmissionExecution(outcome, true));

        mockMvc.perform(post("/api/v1/me/survey-responses")
                        .principal(authentication)
                        .header("Idempotency-Key", "request-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roundId":"%s","consentReceiptId":"%s","answers":[]}
                                """.formatted(roundId, consentReceiptId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.persisted").value(true))
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.responseId")
                        .value(responseId.toString()));
    }

    @Test
    void localPreviewSubmissionUsesNonPersistentPathAndReturnsOk()
            throws Exception {
        SurveyUserId userId = new SurveyUserId("user-a");
        UUID idempotencyKey = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID consentReceiptId = UUID.randomUUID();
        UUID contentId = UUID.randomUUID();
        SurveySubmissionOutcome outcome = new SurveySubmissionOutcome(
                200,
                "SURVEY_RESPONSE_SUBMITTED",
                new SurveyResponseId(idempotencyKey),
                new SurveyRoundId(roundId),
                new SurveyContentVersionId(contentId),
                Instant.parse("2026-09-01T00:00:00Z"),
                List.of());
        when(previewMode.enabledFor(userId)).thenReturn(true);
        when(submissions.submitPreview(
                eq(userId), eq(idempotencyKey.toString()), any()))
                .thenReturn(new SurveyResponseSubmissionService
                        .SubmissionExecution(outcome, false));

        mockMvc.perform(post("/api/v1/me/survey-responses")
                        .principal(authentication)
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roundId":"%s","consentReceiptId":"%s","answers":[]}
                                """.formatted(roundId, consentReceiptId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status")
                        .value("PREVIEW_VALIDATED"))
                .andExpect(jsonPath("$.persisted").value(false))
                .andExpect(jsonPath("$.responseId").doesNotExist())
                .andExpect(jsonPath("$.replayed").doesNotExist())
                .andExpect(jsonPath("$.validatedAt")
                        .value("2026-09-01T00:00:00Z"));

        verify(submissions, never()).submit(any(), any(), any());
    }
}
