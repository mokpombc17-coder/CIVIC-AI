package com.hamcheeze.vote.survey.infra.persona;

import com.hamcheeze.vote.persona.application.PersonaSurveySourceErrorCode;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceException;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PersonaSurveySourceQueryAdapterTest {

    private final SurveyResponseRepository responses =
            mock(SurveyResponseRepository.class);
    private final SurveyRoundRepository rounds =
            mock(SurveyRoundRepository.class);
    private final SurveyContentVersionRepository contents =
            mock(SurveyContentVersionRepository.class);
    private PersonaSurveySourceQueryAdapter adapter;

    @BeforeEach
    void setUp() {
        adapter = new PersonaSurveySourceQueryAdapter(
                responses,
                rounds,
                contents,
                new PersonaSurveySourceMapper());
    }

    @Test
    void missingResponseIsReportedAsSourceNotFound() {
        SurveyResponseId responseId = responseId();
        when(responses.findById(responseId)).thenReturn(Optional.empty());

        assertCode(
                () -> adapter.getByResponseId(sourceId(responseId)),
                PersonaSurveySourceErrorCode
                        .PERSONA_SURVEY_SOURCE_NOT_FOUND);
    }

    @Test
    void findsLatestSourceIdByPersonaUserId() {
        PersonaUserId userId = new PersonaUserId("user-1");
        SurveyResponse response = response(responseId());
        when(responses.findLatestByUserId(
                new SurveyUserId(userId.value())))
                .thenReturn(Optional.of(response));

        assertThat(adapter.findLatestSourceIdByUserId(userId))
                .contains(sourceId(response.id()));
    }

    @Test
    void missingReferencedRoundIsReportedAsIntegrityViolation() {
        SurveyResponseId responseId = responseId();
        SurveyResponse response = response(responseId);
        when(responses.findById(responseId))
                .thenReturn(Optional.of(response));
        when(rounds.findById(response.roundId()))
                .thenReturn(Optional.empty());

        assertCode(
                () -> adapter.getByResponseId(sourceId(responseId)),
                PersonaSurveySourceErrorCode
                        .PERSONA_SURVEY_SOURCE_INTEGRITY_VIOLATION);
    }

    @Test
    void missingReferencedContentIsReportedAsIntegrityViolation() {
        SurveyResponseId responseId = responseId();
        SurveyResponse response = response(responseId);
        when(responses.findById(responseId))
                .thenReturn(Optional.of(response));
        when(rounds.findById(response.roundId()))
                .thenReturn(Optional.of(round(response)));
        when(contents.findById(response.contentVersionId()))
                .thenReturn(Optional.empty());

        assertCode(
                () -> adapter.getByResponseId(sourceId(responseId)),
                PersonaSurveySourceErrorCode
                        .PERSONA_SURVEY_SOURCE_INTEGRITY_VIOLATION);
    }

    private static void assertCode(
            Runnable action,
            PersonaSurveySourceErrorCode code
    ) {
        assertThatThrownBy(action::run)
                .isInstanceOf(PersonaSurveySourceException.class)
                .extracting("code")
                .isEqualTo(code);
    }

    private static SurveyResponse response(SurveyResponseId responseId) {
        return SurveyResponse.rehydrate(
                responseId,
                new SurveyUserId("user-1"),
                new SurveyRoundId(uuid(2)),
                new SurveyRoundNumber(1),
                new SurveyContentVersionId(uuid(3)),
                Instant.parse("2026-08-13T00:00:00Z"),
                List.of());
    }

    private static SurveyRound round(SurveyResponse response) {
        Instant now = Instant.parse("2026-08-13T00:00:00Z");
        return SurveyRound.rehydrate(
                response.roundId(),
                response.roundNumber(),
                response.contentVersionId(),
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                now.minusSeconds(10),
                null,
                null,
                null,
                new SurveyActorId("admin"),
                now.minusSeconds(20),
                0);
    }

    private static SurveyResponseId responseId() {
        return new SurveyResponseId(uuid(1));
    }

    private static PersonaSourceId sourceId(
            SurveyResponseId responseId
    ) {
        return new PersonaSourceId(responseId.value());
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
