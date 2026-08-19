package com.hamcheeze.vote.shared.integration.opinionmap;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapSnapshotFinalizedV1Test {

    @Test
    void preservesImmutableFinalSnapshotContract() {
        ArrayList<OpinionMapSnapshotFinalizedV1.OptionCount> counts =
                new ArrayList<>(List.of(
                        new OpinionMapSnapshotFinalizedV1.OptionCount(
                                uuid(3), 2)));

        OpinionMapSnapshotFinalizedV1 event = event(2, counts);
        counts.clear();

        assertThat(event.closedAt()).isEqualTo(Instant.parse(
                "2026-08-19T01:00:00.123456Z"));
        assertThat(event.finalizedAt()).isEqualTo(Instant.parse(
                "2026-08-19T01:01:00.987654Z"));
        assertThat(event.optionCounts()).hasSize(1);
        assertThatThrownBy(() -> event.optionCounts().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsIncompleteOrUnverifiableSnapshot() {
        assertThatThrownBy(() -> event(2, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sum");

        assertThatThrownBy(() -> new OpinionMapSnapshotFinalizedV1(
                uuid(1),
                uuid(2),
                OpinionMapSnapshotFinalizedV1.ClosureType.DEADLINE_REACHED,
                Instant.parse("2026-08-19T01:00:00Z"),
                Instant.parse("2026-08-19T01:01:00Z"),
                1,
                1,
                "unknown-format",
                "a".repeat(64),
                List.of(new OpinionMapSnapshotFinalizedV1.OptionCount(
                        uuid(3), 1))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("responseHashFormat");
    }

    private static OpinionMapSnapshotFinalizedV1 event(
            int responseCount,
            List<OpinionMapSnapshotFinalizedV1.OptionCount> counts
    ) {
        return new OpinionMapSnapshotFinalizedV1(
                uuid(1),
                uuid(2),
                OpinionMapSnapshotFinalizedV1.ClosureType.DEADLINE_REACHED,
                Instant.parse("2026-08-19T01:00:00.123456789Z"),
                Instant.parse("2026-08-19T01:01:00.987654321Z"),
                responseCount,
                responseCount,
                OpinionMapSnapshotFinalizedV1.RESPONSE_HASH_FORMAT,
                "a".repeat(64),
                counts);
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13150000-0000-0000-0000-%012d".formatted(suffix));
    }
}
