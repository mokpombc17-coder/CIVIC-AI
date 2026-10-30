package com.hamcheeze.vote.survey.infra.scheduling;

import com.hamcheeze.vote.survey.application.round.SurveyRoundActivationJob;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationPlan;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SurveyRoundActivationSchedulerTest {

    private static final Instant NOW =
            Instant.parse("2026-08-20T00:00:00Z");

    @Test
    void pollsJobAndRecordsActivationMetrics() {
        SurveyRoundActivationJob job = mock(SurveyRoundActivationJob.class);
        SurveyRoundActivationPlan plan = mock(
                SurveyRoundActivationPlan.class);
        SurveyRound round = mock(SurveyRound.class);
        when(plan.changed()).thenReturn(true);
        when(plan.targetRound()).thenReturn(round);
        when(round.scheduledAt()).thenReturn(
                Optional.of(NOW.minusSeconds(37)));
        when(job.activateDueRounds()).thenReturn(List.of(plan));
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SurveyRoundActivationScheduler scheduler =
                new SurveyRoundActivationScheduler(
                        job,
                        registry,
                        Clock.fixed(NOW, ZoneOffset.UTC));

        scheduler.activateDueRounds();

        verify(job).activateDueRounds();
        assertThat(counter(registry, "polls")).isEqualTo(1.0);
        assertThat(counter(registry, "activated")).isEqualTo(1.0);
        assertThat(counter(registry, "failures")).isZero();
        assertThat(registry.get(
                        "vote.survey.round.activation.oldest.due.delay.seconds")
                .gauge().value()).isEqualTo(37.0);
    }

    @Test
    void failureIsObservedAndNextPollCanRetry() {
        SurveyRoundActivationJob job = mock(SurveyRoundActivationJob.class);
        when(job.activateDueRounds())
                .thenThrow(new IllegalStateException("temporary failure"))
                .thenReturn(List.of());
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SurveyRoundActivationScheduler scheduler =
                new SurveyRoundActivationScheduler(
                        job,
                        registry,
                        Clock.fixed(NOW, ZoneOffset.UTC));

        scheduler.activateDueRounds();
        scheduler.activateDueRounds();

        assertThat(counter(registry, "polls")).isEqualTo(2.0);
        assertThat(counter(registry, "failures")).isEqualTo(1.0);
        verify(job, org.mockito.Mockito.times(2)).activateDueRounds();
    }

    @Test
    void disabledPropertyDoesNotCreateScheduler() {
        contextRunner("false").run(context -> assertThat(context)
                .doesNotHaveBean(SurveyRoundActivationScheduler.class));
    }

    @Test
    void enabledPropertyCreatesScheduler() {
        contextRunner("true").run(context -> assertThat(context)
                .hasSingleBean(SurveyRoundActivationScheduler.class));
    }

    private static ApplicationContextRunner contextRunner(String enabled) {
        return new ApplicationContextRunner()
                .withPropertyValues(
                        "vote.survey.round-activation.enabled=" + enabled)
                .withBean(
                        SurveyRoundActivationJob.class,
                        () -> mock(SurveyRoundActivationJob.class))
                .withBean(SimpleMeterRegistry.class)
                .withUserConfiguration(
                        SurveyRoundActivationScheduler.class);
    }

    private static double counter(
            SimpleMeterRegistry registry,
            String suffix
    ) {
        return registry.get("vote.survey.round.activation." + suffix)
                .counter().count();
    }
}
