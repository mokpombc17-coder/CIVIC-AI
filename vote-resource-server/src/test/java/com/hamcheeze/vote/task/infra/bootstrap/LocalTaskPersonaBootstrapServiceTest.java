package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.PersonaGenerationWorker;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDispatcher;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyBootstrapService;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LocalTaskPersonaBootstrapServiceTest {

    private static final String SUBJECT = "local-user-1";
    private static final String FIRST_UUID =
            "41000000-0000-0000-0000-000000000101";
    private static final String SECOND_UUID =
            "41000000-0000-0000-0000-000000000102";

    @Test
    void parsesCanonicalUuidSubjectsInConfiguredOrder() {
        assertThat(LocalTaskPersonaBootstrapService.resolveUserSubjects(
                SUBJECT, FIRST_UUID + ", " + SECOND_UUID))
                .containsExactly(FIRST_UUID, SECOND_UUID);
    }

    @Test
    void fallsBackToLegacySingleSubjectWhenListIsBlank() {
        assertThat(LocalTaskPersonaBootstrapService.resolveUserSubjects(
                SUBJECT, "  "))
                .containsExactly(SUBJECT);
    }

    @Test
    void rejectsInvalidOrDuplicateConfiguredUuidSubjects() {
        assertThatThrownBy(() -> LocalTaskPersonaBootstrapService
                .resolveUserSubjects(SUBJECT, "user01@dev.civic.test"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("canonical lowercase UUID");
        assertThatThrownBy(() -> LocalTaskPersonaBootstrapService
                .resolveUserSubjects(
                        SUBJECT, FIRST_UUID + "," + FIRST_UUID))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("duplicates");
    }

    @Test
    void waitsWhenAnotherWorkerIsProcessingAndObservesSuccess() {
        Fixture fixture = fixture(Duration.ofSeconds(1),
                Duration.ofMillis(100));
        when(fixture.currentPersonas().findCurrent(any()))
                .thenReturn(processing(), processing(), ready());

        assertThat(fixture.service().initialize())
                .isEqualTo(LocalTaskPersonaBootstrapResult.ALREADY_PRESENT);

        assertThat(fixture.nanoTime().get()).isEqualTo(
                Duration.ofMillis(100).toNanos());
        verify(fixture.personaWorker(), never()).executeOne();
        verify(fixture.outboxDispatcher(), never()).dispatchAvailable();
    }

    @Test
    void failsWithTimeoutWhenProcessingDoesNotComplete() {
        Fixture fixture = fixture(Duration.ofMillis(250),
                Duration.ofMillis(100));
        when(fixture.currentPersonas().findCurrent(any()))
                .thenReturn(processing());

        assertThatThrownBy(() -> fixture.service().initialize())
                .isInstanceOf(LocalTaskPersonaBootstrapException.class)
                .hasMessageContaining(
                        "timed out waiting for local Task Persona")
                .hasMessageContaining("status=PROCESSING");

        assertThat(fixture.nanoTime().get()).isEqualTo(
                Duration.ofMillis(250).toNanos());
        verify(fixture.personaWorker(), never()).executeOne();
    }

    @Test
    void preservesInterruptWhenPollingIsInterrupted() {
        var surveys = mock(LocalSurveyBootstrapService.class);
        var submissions = mock(SurveyResponseSubmissionService.class);
        var outbox = mock(IntegrationOutboxDispatcher.class);
        var worker = mock(PersonaGenerationWorker.class);
        var current = mock(CurrentPersonaQueryService.class);
        when(current.findCurrent(any())).thenReturn(processing());
        var service = new LocalTaskPersonaBootstrapService(
                surveys, submissions, outbox, worker, current, SUBJECT,
                Duration.ofSeconds(1), Duration.ofMillis(100),
                () -> 0L,
                duration -> {
                    throw new InterruptedException("test interrupt");
                });

        try {
            assertThatThrownBy(service::initialize)
                    .isInstanceOf(LocalTaskPersonaBootstrapException.class)
                    .hasMessageContaining(
                            "interrupted while waiting for local Task Persona")
                    .hasCauseInstanceOf(InterruptedException.class);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    private static Fixture fixture(
            Duration timeout,
            Duration pollInterval
    ) {
        var surveys = mock(LocalSurveyBootstrapService.class);
        var submissions = mock(SurveyResponseSubmissionService.class);
        var outbox = mock(IntegrationOutboxDispatcher.class);
        var worker = mock(PersonaGenerationWorker.class);
        var current = mock(CurrentPersonaQueryService.class);
        var nanoTime = new AtomicLong();
        var service = new LocalTaskPersonaBootstrapService(
                surveys, submissions, outbox, worker, current, SUBJECT,
                timeout, pollInterval, nanoTime::get, nanoTime::addAndGet);
        return new Fixture(
                service, outbox, worker, current, nanoTime);
    }

    private static CurrentPersonaStatus processing() {
        return status(CurrentPersonaStatus.Status.PROCESSING, false);
    }

    private static CurrentPersonaStatus ready() {
        return status(CurrentPersonaStatus.Status.SUCCEEDED, true);
    }

    private static CurrentPersonaStatus status(
            CurrentPersonaStatus.Status status,
            boolean ready
    ) {
        return new CurrentPersonaStatus(
                Optional.empty(),
                Optional.of(new PersonaGenerationId(
                        UUID.fromString(
                                "41000000-0000-0000-0000-000000000001"))),
                status,
                ready
                        ? Optional.of(new PersonaId("local-persona"))
                        : Optional.empty(),
                Optional.empty(),
                1,
                Optional.empty(),
                false,
                Optional.empty(),
                false,
                false,
                ready,
                ready
                        ? Set.of(CurrentPersonaStatus.Capability
                        .USE_PERSONALIZED_SERVICE)
                        : Set.of());
    }

    private record Fixture(
            LocalTaskPersonaBootstrapService service,
            IntegrationOutboxDispatcher outboxDispatcher,
            PersonaGenerationWorker personaWorker,
            CurrentPersonaQueryService currentPersonas,
            AtomicLong nanoTime
    ) {
    }
}
