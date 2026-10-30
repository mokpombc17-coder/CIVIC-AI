package com.hamcheeze.vote.survey.infra.scheduling;

import com.hamcheeze.vote.survey.application.round.SurveyRoundActivationJob;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationPlan;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;

@Component
@ConditionalOnProperty(
        prefix = "vote.survey.round-activation",
        name = "enabled",
        havingValue = "true")
public class SurveyRoundActivationScheduler {

    private static final Logger log = LoggerFactory.getLogger(
            SurveyRoundActivationScheduler.class);

    private final SurveyRoundActivationJob activationJob;
    private final Clock clock;
    private final Counter pollingCounter;
    private final Counter activatedCounter;
    private final Counter failureCounter;
    private final AtomicLong oldestDueDelaySeconds = new AtomicLong();

    @Autowired
    public SurveyRoundActivationScheduler(
            SurveyRoundActivationJob activationJob,
            MeterRegistry meterRegistry
    ) {
        this(activationJob, meterRegistry, Clock.systemUTC());
    }

    SurveyRoundActivationScheduler(
            SurveyRoundActivationJob activationJob,
            MeterRegistry meterRegistry,
            Clock clock
    ) {
        this.activationJob = Objects.requireNonNull(
                activationJob, "activationJob");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.pollingCounter = Counter.builder(
                        "vote.survey.round.activation.polls")
                .description("Survey round activation polling executions")
                .register(meterRegistry);
        this.activatedCounter = Counter.builder(
                        "vote.survey.round.activation.activated")
                .description("Survey rounds activated by the scheduler")
                .register(meterRegistry);
        this.failureCounter = Counter.builder(
                        "vote.survey.round.activation.failures")
                .description("Survey round activation polling failures")
                .register(meterRegistry);
        Gauge.builder(
                        "vote.survey.round.activation.oldest.due.delay.seconds",
                        oldestDueDelaySeconds,
                        AtomicLong::doubleValue)
                .description("Delay of the oldest due Survey round seen by the latest poll")
                .baseUnit("seconds")
                .register(meterRegistry);
    }

    @Scheduled(
            fixedDelayString =
                    "${vote.survey.round-activation.fixed-delay:5s}",
            initialDelayString =
                    "${vote.survey.round-activation.initial-delay:0s}")
    public void activateDueRounds() {
        pollingCounter.increment();
        Instant polledAt = clock.instant();
        try {
            List<SurveyRoundActivationPlan> plans =
                    activationJob.activateDueRounds();
            long activated = plans.stream()
                    .filter(SurveyRoundActivationPlan::changed)
                    .count();
            activatedCounter.increment(activated);
            oldestDueDelaySeconds.set(oldestDueDelaySeconds(plans, polledAt));
            if (!plans.isEmpty()) {
                log.info(
                        "Survey round activation poll completed: candidates={}, activated={}, oldestDueDelaySeconds={}",
                        plans.size(),
                        activated,
                        oldestDueDelaySeconds.get());
            }
        } catch (RuntimeException exception) {
            failureCounter.increment();
            log.error(
                    "Survey round activation poll failed; the next polling cycle will retry due rounds",
                    exception);
        }
    }

    private static long oldestDueDelaySeconds(
            List<SurveyRoundActivationPlan> plans,
            Instant polledAt
    ) {
        return plans.stream()
                .map(SurveyRoundActivationPlan::targetRound)
                .flatMap(round -> round.scheduledAt().stream())
                .mapToLong(scheduledAt -> Math.max(
                        0L,
                        Duration.between(scheduledAt, polledAt).toSeconds()))
                .max()
                .orElse(0L);
    }
}
