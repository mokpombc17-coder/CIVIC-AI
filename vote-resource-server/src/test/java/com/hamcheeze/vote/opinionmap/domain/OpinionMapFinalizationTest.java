package com.hamcheeze.vote.opinionmap.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class OpinionMapFinalizationTest {

    private static final UUID TASK_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000101");
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:00:00Z");

    @Test
    void preservesRequestWhileReassessingProjectionReadiness() {
        OpinionMapFinalizationRequest request = request(2);
        OpinionMapFinalization waiting = OpinionMapFinalization.assess(
                request, 1, CLOSED_AT.plusSeconds(1));

        OpinionMapFinalization ready = waiting.reassess(
                2, CLOSED_AT.plusSeconds(2));

        assertThat(waiting.status()).isEqualTo(
                OpinionMapFinalizationStatus.WAITING_FOR_SUBMISSIONS);
        assertThat(ready.status()).isEqualTo(
                OpinionMapFinalizationStatus.READY_TO_FINALIZE);
        assertThat(ready.request()).isEqualTo(request);
        assertThat(ready.projectedSubmissionCount()).isEqualTo(2);
        assertThat(ready.evaluatedAt())
                .isEqualTo(CLOSED_AT.plusSeconds(2));
    }

    @Test
    void distinguishesSameRequestFromConflictingClosureFacts() {
        OpinionMapFinalization finalization = OpinionMapFinalization.assess(
                request(2), 0, CLOSED_AT.plusSeconds(1));

        assertThat(finalization.hasSameRequest(request(2))).isTrue();
        assertThat(finalization.hasSameRequest(
                new OpinionMapFinalizationRequest(
                        TASK_ID,
                        OpinionMapTaskClosureType.EARLY_CLOSED,
                        CLOSED_AT,
                        2))).isFalse();
        assertThat(finalization.hasSameRequest(request(3))).isFalse();
    }

    private static OpinionMapFinalizationRequest request(int expectedCount) {
        return new OpinionMapFinalizationRequest(
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                expectedCount);
    }
}
