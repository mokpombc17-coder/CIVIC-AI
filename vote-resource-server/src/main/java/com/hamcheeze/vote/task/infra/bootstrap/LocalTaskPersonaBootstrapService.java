package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.PersonaGenerationWorker;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDispatcher;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyBootstrapService;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyFixture;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService.SubmitSurveyResponseCommand;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService.SubmissionExecution;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.task.application.bootstrap.LocalTaskPersonaFixture;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/**
 * Prepares a ready Persona for the local frontend JWT subject without creating
 * a Task prediction or consuming a Task submission.
 */
@Service
@Profile("local")
@ConditionalOnExpression(
        "'${vote.task.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.task.bootstrap.persona-ready-enabled:false}' == 'true' and "
                + "'${vote.survey.bootstrap.enabled:false}' == 'true' and "
                + "'${vote.integration.outbox.dispatcher-enabled:false}' == 'true' and "
                + "'${vote.persona.enabled:false}' == 'true' and "
                + "'${vote.persona.provider:http}' == 'fake'")
public class LocalTaskPersonaBootstrapService {

    private final LocalSurveyBootstrapService surveys;
    private final SurveyResponseSubmissionService submissions;
    private final IntegrationOutboxDispatcher outboxDispatcher;
    private final PersonaGenerationWorker personaWorker;
    private final CurrentPersonaQueryService currentPersonas;
    private final String userSubject;
    private final long readyTimeoutNanos;
    private final long pollIntervalNanos;
    private final LongSupplier nanoTime;
    private final PollSleeper pollSleeper;

    @Autowired
    public LocalTaskPersonaBootstrapService(
            LocalSurveyBootstrapService surveys,
            SurveyResponseSubmissionService submissions,
            IntegrationOutboxDispatcher outboxDispatcher,
            PersonaGenerationWorker personaWorker,
            CurrentPersonaQueryService currentPersonas,
            @Value("${vote.task.bootstrap.persona-subject:local-user-1}")
            String userSubject,
            @Value("${vote.task.bootstrap.persona-ready-timeout:10s}")
            Duration readyTimeout,
            @Value("${vote.task.bootstrap.persona-ready-poll-interval:100ms}")
            Duration pollInterval
    ) {
        this(surveys, submissions, outboxDispatcher, personaWorker,
                currentPersonas, userSubject, readyTimeout, pollInterval,
                System::nanoTime, TimeUnit.NANOSECONDS::sleep);
    }

    LocalTaskPersonaBootstrapService(
            LocalSurveyBootstrapService surveys,
            SurveyResponseSubmissionService submissions,
            IntegrationOutboxDispatcher outboxDispatcher,
            PersonaGenerationWorker personaWorker,
            CurrentPersonaQueryService currentPersonas,
            String userSubject,
            Duration readyTimeout,
            Duration pollInterval,
            LongSupplier nanoTime,
            PollSleeper pollSleeper
    ) {
        this.surveys = Objects.requireNonNull(surveys, "surveys");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.outboxDispatcher = Objects.requireNonNull(
                outboxDispatcher, "outboxDispatcher");
        this.personaWorker = Objects.requireNonNull(
                personaWorker, "personaWorker");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.nanoTime = Objects.requireNonNull(nanoTime, "nanoTime");
        this.pollSleeper = Objects.requireNonNull(
                pollSleeper, "pollSleeper");
        if (userSubject == null || userSubject.isBlank()) {
            throw new IllegalArgumentException(
                    "local Task Persona subject must not be blank");
        }
        this.userSubject = userSubject.strip();
        this.readyTimeoutNanos = positiveNanos(
                readyTimeout, "readyTimeout");
        this.pollIntervalNanos = positiveNanos(
                pollInterval, "pollInterval");
    }

    public LocalTaskPersonaBootstrapResult initialize() {
        surveys.initialize();
        PersonaUserId personaUserId = new PersonaUserId(userSubject);
        CurrentPersonaStatus initial = currentPersonas.findCurrent(
                personaUserId);
        if (initial.personaReady()) {
            return LocalTaskPersonaBootstrapResult.ALREADY_PRESENT;
        }

        boolean changed = false;
        if (initial.status() == CurrentPersonaStatus.Status.NOT_SUBMITTED) {
            submitSurvey();
            changed = true;
        }

        changed = awaitReady(personaUserId, changed);
        return changed
                ? LocalTaskPersonaBootstrapResult.CREATED
                : LocalTaskPersonaBootstrapResult.ALREADY_PRESENT;
    }

    public String userSubject() {
        return userSubject;
    }

    private void submitSurvey() {
        SubmissionExecution execution = submissions.submit(
                new SurveyUserId(userSubject),
                LocalTaskPersonaFixture.SURVEY_IDEMPOTENCY_KEY,
                new SubmitSurveyResponseCommand(
                        LocalSurveyFixture.ROUND_ID,
                        LocalTaskPersonaFixture.answers()));
        if (!execution.outcome().succeeded()) {
            throw new LocalTaskPersonaBootstrapException(
                    "local Task Persona Survey submission failed for subject "
                            + userSubject + ": "
                            + execution.outcome().code());
        }
    }

    private boolean awaitReady(
            PersonaUserId userId,
            boolean changed
    ) {
        long startedAt = nanoTime.getAsLong();
        CurrentPersonaStatus current;
        while (true) {
            current = currentPersonas.findCurrent(userId);
            if (current.personaReady()) {
                return changed;
            }

            boolean progressed = switch (current.status()) {
                case GENERATION_MISSING ->
                        outboxDispatcher.dispatchAvailable() > 0;
                case PENDING -> personaWorker.executeOne();
                case PROCESSING -> false;
                case NOT_SUBMITTED, SUCCEEDED, FAILED ->
                        throw notReady(current);
            };
            changed = changed || progressed;
            if (progressed) {
                continue;
            }

            long remainingNanos = readyTimeoutNanos
                    - (nanoTime.getAsLong() - startedAt);
            if (remainingNanos <= 0) {
                throw timedOut(current);
            }
            sleepBeforePolling(
                    Math.min(pollIntervalNanos, remainingNanos), current);
        }
    }

    private void sleepBeforePolling(
            long durationNanos,
            CurrentPersonaStatus current
    ) {
        try {
            pollSleeper.sleep(durationNanos);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new LocalTaskPersonaBootstrapException(
                    "interrupted while waiting for local Task Persona for "
                            + "subject " + userSubject + " (status="
                            + current.status() + ")",
                    exception);
        }
    }

    private LocalTaskPersonaBootstrapException timedOut(
            CurrentPersonaStatus status
    ) {
        return new LocalTaskPersonaBootstrapException(
                "timed out waiting for local Task Persona for subject "
                        + userSubject + " after "
                        + Duration.ofNanos(readyTimeoutNanos)
                        + " (status=" + status.status() + ")");
    }

    private LocalTaskPersonaBootstrapException notReady(
            CurrentPersonaStatus status
    ) {
        String errorCode = status.lastErrorCode().orElse("none");
        return new LocalTaskPersonaBootstrapException(
                "local Task Persona is not ready for subject "
                        + userSubject + " (status=" + status.status()
                        + ", lastErrorCode=" + errorCode + ")");
    }

    private static long positiveNanos(
            Duration duration,
            String field
    ) {
        Objects.requireNonNull(duration, field);
        if (duration.isZero() || duration.isNegative()) {
            throw new IllegalArgumentException(
                    field + " must be positive");
        }
        return duration.toNanos();
    }

    @FunctionalInterface
    interface PollSleeper {
        void sleep(long durationNanos) throws InterruptedException;
    }
}
