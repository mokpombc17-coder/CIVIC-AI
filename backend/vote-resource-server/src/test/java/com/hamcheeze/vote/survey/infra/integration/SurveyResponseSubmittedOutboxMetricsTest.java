package com.hamcheeze.vote.survey.infra.integration;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SurveyResponseSubmittedOutboxMetricsTest {

    @Test
    void exposesUnresolvedDeadLetterWithoutChangingExistingMetrics() {
        SurveyResponseSubmittedOutboxStatusQuery statusQuery =
                mock(SurveyResponseSubmittedOutboxStatusQuery.class);
        when(statusQuery.snapshot()).thenReturn(
                new SurveyResponseSubmittedOutboxStatusQuery.Snapshot(
                        2, 30, 4, 1, 3));
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        new SurveyResponseSubmittedOutboxMetrics(statusQuery)
                .bindTo(registry);

        assertThat(gauge(registry,
                "vote.survey.response.outbox.pending")).isEqualTo(2);
        assertThat(gauge(registry,
                "vote.survey.response.outbox.oldest.pending.age.seconds"))
                .isEqualTo(30);
        assertThat(gauge(registry,
                "vote.survey.response.outbox.dead.letter")).isEqualTo(4);
        assertThat(gauge(registry,
                "vote.survey.response.outbox.dead.letter.unresolved"))
                .isEqualTo(1);
        assertThat(gauge(registry,
                "vote.survey.response.outbox.missing")).isEqualTo(3);
    }

    private static double gauge(
            SimpleMeterRegistry registry,
            String name
    ) {
        return registry.get(name).gauge().value();
    }
}
