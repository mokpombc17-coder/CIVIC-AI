package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.consent.SurveyConsentException;
import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentReceipt;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SurveyConsentControllerTest {

    private final AuthenticatedUserIdResolver userIds =
            mock(AuthenticatedUserIdResolver.class);
    private final SurveyConsentService consents =
            mock(SurveyConsentService.class);
    private final Authentication authentication = mock(Authentication.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(userIds.resolve(authentication)).thenReturn("user-a");
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new SurveyConsentController(userIds, consents))
                .setControllerAdvice(new SurveyApiExceptionHandler())
                .build();
    }

    @Test
    void currentDocumentReturnsTheExactVersionAndHash() throws Exception {
        SurveyRoundId roundId = new SurveyRoundId(UUID.randomUUID());
        SurveyConsentDocument document = new SurveyConsentDocument(
                roundId,
                "survey-consent",
                "v3",
                "Survey consent",
                "Consent text",
                "a".repeat(64),
                Instant.parse("2026-09-03T00:00:00Z"));
        when(consents.findCurrentDocument(roundId)).thenReturn(document);

        mockMvc.perform(get(
                        "/api/v1/me/survey-consent-documents/current")
                        .param("roundId", roundId.value().toString())
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documentCode")
                        .value("survey-consent"))
                .andExpect(jsonPath("$.documentVersion").value("v3"))
                .andExpect(jsonPath("$.content").value("Consent text"))
                .andExpect(jsonPath("$.contentHash")
                        .value("a".repeat(64)));
    }

    @Test
    void acceptanceReturnsServerReceiptAndReplayUsesOk() throws Exception {
        SurveyRoundId roundId = new SurveyRoundId(UUID.randomUUID());
        ConsentReceiptId receiptId = new ConsentReceiptId(UUID.randomUUID());
        Instant acceptedAt = Instant.parse("2026-09-03T00:00:02Z");
        SurveyConsentReceipt receipt = new SurveyConsentReceipt(
                receiptId,
                new SurveyUserId("user-a"),
                roundId,
                "survey-consent",
                "v3",
                "Consent text",
                "a".repeat(64),
                acceptedAt,
                Instant.parse("2026-09-03T00:00:01Z"),
                UUID.randomUUID(),
                "b".repeat(64));
        when(consents.accept(
                eq(new SurveyUserId("user-a")),
                eq("consent-key"),
                any())).thenReturn(
                new SurveyConsentService.Acceptance(receipt, false));

        mockMvc.perform(post("/api/v1/me/survey-consents")
                        .principal(authentication)
                        .header("Idempotency-Key", "consent-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "documentCode": "survey-consent",
                                  "documentVersion": "v3",
                                  "roundId": "%s",
                                  "clientClickedAt": "2026-09-03T00:00:01Z"
                                }
                                """.formatted(roundId.value())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.consentReceiptId")
                        .value(receiptId.value().toString()))
                .andExpect(jsonPath("$.acceptedAt")
                        .value(acceptedAt.toString()));

        verify(consents).accept(
                eq(new SurveyUserId("user-a")),
                eq("consent-key"),
                any());
    }

    @Test
    void documentVersionChangeHasStableConflictCode() throws Exception {
        when(consents.accept(any(), any(), any())).thenThrow(
                new SurveyConsentException(
                        409,
                        "CONSENT_DOCUMENT_VERSION_CHANGED",
                        "The consent document changed before acceptance."));

        mockMvc.perform(post("/api/v1/me/survey-consents")
                        .principal(authentication)
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "documentCode": "survey-consent",
                                  "documentVersion": "old-v1",
                                  "roundId": "%s"
                                }
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("CONSENT_DOCUMENT_VERSION_CHANGED"));
    }
}
