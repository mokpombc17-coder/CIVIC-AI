package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.query.CurrentSurveyQueryService;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.query.MySurveyResponseQueryService;
import com.hamcheeze.vote.survey.application.query.SurveyEligibilityQueryService;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.response.SurveySubmissionOutcome;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
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
                        contents))
                .setControllerAdvice(new SurveyApiExceptionHandler())
                .build();
    }

    @Test
    void activeRoundAbsenceIsOperationalProblem() throws Exception {
        ServiceEligibilityDecision decision =
                mock(ServiceEligibilityDecision.class);
        when(currentSurveys.findCurrent(any())).thenReturn(
                new CurrentSurveyQueryService.CurrentSurveyResult(
                        Optional.empty(), decision));

        mockMvc.perform(get("/api/v1/me/surveys/current")
                        .principal(authentication))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_ACTIVE_ROUND_UNAVAILABLE"));
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
    void successfulReplayIsExposedInResponseBody() throws Exception {
        UUID roundId = UUID.randomUUID();
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
                                {"roundId":"%s","answers":[]}
                                """.formatted(roundId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code")
                        .value("SURVEY_RESPONSE_SUBMITTED"))
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.responseId")
                        .value(responseId.toString()));
    }
}
