package com.hamcheeze.vote.opinionmap.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapFinalizationPolicyTest {

    private static final UUID TASK_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000001");
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:02:03.123456789Z");

    @Test
    void acceptsOnlyResultEligibleTaskClosureTypes() {
        assertThat(OpinionMapTaskClosureType.fromContract("DEADLINE_REACHED"))
                .isEqualTo(OpinionMapTaskClosureType.DEADLINE_REACHED);
        assertThat(OpinionMapTaskClosureType.fromContract("EARLY_CLOSED"))
                .isEqualTo(OpinionMapTaskClosureType.EARLY_CLOSED);

        assertThatThrownBy(() ->
                OpinionMapTaskClosureType.fromContract("CANCELLED"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not eligible");
        assertThatThrownBy(() ->
                OpinionMapTaskClosureType.fromContract("MISSED_SCHEDULE"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not eligible");
    }

    @Test
    void finalizationRequestPreservesImmutableClosureFact() {
        OpinionMapFinalizationRequest request = request(2);

        assertThat(request.taskId()).isEqualTo(TASK_ID);
        assertThat(request.closureType())
                .isEqualTo(OpinionMapTaskClosureType.DEADLINE_REACHED);
        assertThat(request.closedAt()).isEqualTo(
                CLOSED_AT.truncatedTo(ChronoUnit.MICROS));
        assertThat(request.expectedSubmissionCount()).isEqualTo(2);
    }

    @Test
    void expectedSubmissionCountMustNotBeNegative() {
        assertThatThrownBy(() -> request(-1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be negative");
    }

    @Test
    void waitsWhileSubmissionProjectionsAreStillMissing() {
        OpinionMapFinalizationDecision decision =
                OpinionMapFinalizationPolicy.assess(request(3), 1);

        assertThat(decision.status()).isEqualTo(
                OpinionMapFinalizationStatus.WAITING_FOR_SUBMISSIONS);
        assertThat(decision.readyToFinalize()).isFalse();
        assertThat(decision.missingSubmissionCount()).isEqualTo(2);
        assertThat(decision.excessSubmissionCount()).isZero();
    }

    @Test
    void becomesReadyOnlyWhenExpectedAndProjectedCountsMatch() {
        OpinionMapFinalizationDecision decision =
                OpinionMapFinalizationPolicy.assess(request(3), 3);

        assertThat(decision.status()).isEqualTo(
                OpinionMapFinalizationStatus.READY_TO_FINALIZE);
        assertThat(decision.readyToFinalize()).isTrue();
        assertThat(decision.missingSubmissionCount()).isZero();
        assertThat(decision.excessSubmissionCount()).isZero();
    }

    @Test
    void waitingRequestCanBeReassessedWhenAnotherProjectionArrives() {
        OpinionMapFinalizationRequest request = request(2);

        assertThat(OpinionMapFinalizationPolicy.assess(request, 1).status())
                .isEqualTo(
                        OpinionMapFinalizationStatus.WAITING_FOR_SUBMISSIONS);
        assertThat(OpinionMapFinalizationPolicy.assess(request, 2).status())
                .isEqualTo(OpinionMapFinalizationStatus.READY_TO_FINALIZE);
    }

    @Test
    void zeroSubmissionTaskCanBecomeReadyToFinalize() {
        OpinionMapFinalizationDecision decision =
                OpinionMapFinalizationPolicy.assess(request(0), 0);

        assertThat(decision.status()).isEqualTo(
                OpinionMapFinalizationStatus.READY_TO_FINALIZE);
        assertThat(decision.readyToFinalize()).isTrue();
    }

    @Test
    void excessProjectionCountIsAnInconsistencyInsteadOfReadiness() {
        OpinionMapFinalizationDecision decision =
                OpinionMapFinalizationPolicy.assess(request(2), 3);

        assertThat(decision.status()).isEqualTo(
                OpinionMapFinalizationStatus.SUBMISSION_COUNT_INCONSISTENT);
        assertThat(decision.readyToFinalize()).isFalse();
        assertThat(decision.missingSubmissionCount()).isZero();
        assertThat(decision.excessSubmissionCount()).isOne();
    }

    @Test
    void projectedSubmissionCountMustNotBeNegative() {
        assertThatThrownBy(() ->
                OpinionMapFinalizationPolicy.assess(request(0), -1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be negative");
    }

    @Test
    void decisionCannotRepresentStatusThatContradictsCounts() {
        assertThatThrownBy(() -> new OpinionMapFinalizationDecision(
                OpinionMapFinalizationStatus.READY_TO_FINALIZE, 2, 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must match submission counts");
    }

    private static OpinionMapFinalizationRequest request(int expectedCount) {
        return new OpinionMapFinalizationRequest(
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                expectedCount);
    }
}
