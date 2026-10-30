package com.hamcheeze.vote.survey.infra.integration;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
class SurveyResponseSubmittedOutboxMetrics implements MeterBinder {

    private final SurveyResponseSubmittedOutboxStatusQuery statusQuery;

    SurveyResponseSubmittedOutboxMetrics(
            SurveyResponseSubmittedOutboxStatusQuery statusQuery
    ) {
        this.statusQuery = Objects.requireNonNull(
                statusQuery, "statusQuery");
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder(
                        "vote.survey.response.outbox.pending",
                        statusQuery,
                        query -> query.snapshot().pendingCount())
                .description("Pending SurveyResponseSubmitted events")
                .register(registry);
        Gauge.builder(
                        "vote.survey.response.outbox.oldest.pending.age.seconds",
                        statusQuery,
                        query -> query.snapshot().oldestPendingAgeSeconds())
                .description("Age of the oldest pending SurveyResponseSubmitted event")
                .baseUnit("seconds")
                .register(registry);
        Gauge.builder(
                        "vote.survey.response.outbox.dead.letter",
                        statusQuery,
                        query -> query.snapshot().deadLetterCount())
                .description("Dead-lettered SurveyResponseSubmitted events")
                .register(registry);
        Gauge.builder(
                        "vote.survey.response.outbox.dead.letter.unresolved",
                        statusQuery,
                        query -> query.snapshot()
                                .unresolvedDeadLetterCount())
                .description("Unresolved dead-lettered SurveyResponseSubmitted events")
                .register(registry);
        Gauge.builder(
                        "vote.survey.response.outbox.missing",
                        statusQuery,
                        query -> query.snapshot().missingEventCount())
                .description("Final Survey responses without a submitted outbox event")
                .register(registry);
    }
}
