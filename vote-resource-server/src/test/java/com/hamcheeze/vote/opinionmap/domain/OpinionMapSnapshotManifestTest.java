package com.hamcheeze.vote.opinionmap.domain;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapSnapshotManifestTest {

    @Test
    void preservesSortedOptionCountsAsImmutableFacts() {
        ArrayList<OpinionMapOptionCount> counts = new ArrayList<>(List.of(
                new OpinionMapOptionCount(uuid(1), 1),
                new OpinionMapOptionCount(uuid(2), 2)));

        OpinionMapSnapshotManifest manifest =
                new OpinionMapSnapshotManifest(
                        uuid(10),
                        OpinionMapSnapshotManifest.HASH_FORMAT_V1,
                        "a".repeat(64), 3, counts);
        counts.clear();

        assertThat(manifest.optionCounts()).hasSize(2);
        assertThatThrownBy(() -> manifest.optionCounts().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void rejectsInvalidHash() {
        assertThatThrownBy(() -> new OpinionMapSnapshotManifest(
                uuid(10),
                OpinionMapSnapshotManifest.HASH_FORMAT_V1,
                "ABC", 0, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SHA-256");
    }

    @Test
    void rejectsUnsortedOrDuplicateOptions() {
        assertThatThrownBy(() -> new OpinionMapSnapshotManifest(
                uuid(10),
                OpinionMapSnapshotManifest.HASH_FORMAT_V1,
                "a".repeat(64), 2, List.of(
                new OpinionMapOptionCount(uuid(2), 1),
                new OpinionMapOptionCount(uuid(1), 1))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sorted");
    }

    @Test
    void rejectsOptionCountSumDifferentFromResponseCount() {
        assertThatThrownBy(() -> new OpinionMapSnapshotManifest(
                uuid(10),
                OpinionMapSnapshotManifest.HASH_FORMAT_V1,
                "a".repeat(64), 2, List.of(
                new OpinionMapOptionCount(uuid(1), 1))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sum");
    }

    private static java.util.UUID uuid(long suffix) {
        return java.util.UUID.fromString(
                "13130000-0000-0000-0000-%012d".formatted(suffix));
    }
}
