package com.hamcheeze.vote.opinionmap.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapSnapshotTest {

    private static final UUID SNAPSHOT_ID = UUID.fromString(
            "13120000-0000-0000-0000-000000000001");
    private static final UUID TASK_ID = UUID.fromString(
            "13120000-0000-0000-0000-000000000002");
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:00:00.123456789Z");
    private static final Instant FINALIZED_AT = Instant.parse(
            "2026-08-19T01:01:00.987654321Z");

    @Test
    void finalizesOnlyReadyStateAsImmutableFacts() {
        OpinionMapFinalization finalization = OpinionMapFinalization.assess(
                request(2), 2, FINALIZED_AT.minusSeconds(1));

        OpinionMapSnapshot snapshot = OpinionMapSnapshot.finalize(
                SNAPSHOT_ID, finalization, FINALIZED_AT);

        assertThat(snapshot.snapshotId()).isEqualTo(SNAPSHOT_ID);
        assertThat(snapshot.taskId()).isEqualTo(TASK_ID);
        assertThat(snapshot.expectedSubmissionCount()).isEqualTo(2);
        assertThat(snapshot.responseCount()).isEqualTo(2);
        assertThat(snapshot.closedAt()).isEqualTo(Instant.parse(
                "2026-08-19T01:00:00.123456Z"));
        assertThat(snapshot.finalizedAt()).isEqualTo(Instant.parse(
                "2026-08-19T01:01:00.987654Z"));
        assertThat(snapshot.matches(finalization)).isTrue();
    }

    @Test
    void rejectsWaitingFinalization() {
        OpinionMapFinalization waiting = OpinionMapFinalization.assess(
                request(2), 1, FINALIZED_AT);

        assertThatThrownBy(() -> OpinionMapSnapshot.finalize(
                SNAPSHOT_ID, waiting, FINALIZED_AT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ready finalization");
    }

    @Test
    void rejectsMismatchedResponseCount() {
        assertThatThrownBy(() -> new OpinionMapSnapshot(
                SNAPSHOT_ID,
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                2,
                1,
                FINALIZED_AT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("responseCount");
    }

    @Test
    void rejectsFinalizationBeforeTaskClosure() {
        assertThatThrownBy(() -> new OpinionMapSnapshot(
                SNAPSHOT_ID,
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                0,
                0,
                CLOSED_AT.minusSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("finalizedAt");
    }

    private static OpinionMapFinalizationRequest request(int expectedCount) {
        return new OpinionMapFinalizationRequest(
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                CLOSED_AT,
                expectedCount);
    }
}
