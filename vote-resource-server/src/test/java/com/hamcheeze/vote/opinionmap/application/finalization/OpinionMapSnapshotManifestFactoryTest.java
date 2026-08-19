package com.hamcheeze.vote.opinionmap.application.finalization;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapOptionCount;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapSnapshotManifestFactoryTest {

    private static final UUID TASK_ID = uuid(1);
    private static final UUID SNAPSHOT_ID = uuid(2);
    private static final UUID FIRST_OPTION_ID = uuid(31);
    private static final UUID SECOND_OPTION_ID = uuid(32);
    private static final Instant SUBMITTED_AT = Instant.parse(
            "2026-08-19T01:00:00.123456Z");

    private final OpinionMapSnapshotManifestFactory factory =
            new OpinionMapSnapshotManifestFactory();

    @Test
    void hashesResponsesInSubmissionIdOrderAndCountsOptions() {
        OpinionMapSubmissionProjection first = response(
                10, FIRST_OPTION_ID, "첫 번째 이유");
        OpinionMapSubmissionProjection second = response(
                20, SECOND_OPTION_ID, "두 번째 이유");

        OpinionMapSnapshotManifest forward = factory.create(
                snapshot(2), List.of(first, second));
        OpinionMapSnapshotManifest reversed = factory.create(
                snapshot(2), List.of(second, first));

        assertThat(reversed).isEqualTo(forward);
        assertThat(forward.responseHashSha256())
                .matches("[0-9a-f]{64}");
        assertThat(forward.optionCounts()).containsExactly(
                new OpinionMapOptionCount(FIRST_OPTION_ID, 1),
                new OpinionMapOptionCount(SECOND_OPTION_ID, 1));
    }

    @Test
    void hashChangesWhenFinalResponseContentChanges() {
        OpinionMapSnapshotManifest original = factory.create(
                snapshot(1),
                List.of(response(10, FIRST_OPTION_ID, "선택 이유")));
        OpinionMapSnapshotManifest changed = factory.create(
                snapshot(1),
                List.of(response(10, FIRST_OPTION_ID, "변경된 이유")));

        assertThat(changed.responseHashSha256())
                .isNotEqualTo(original.responseHashSha256());
    }

    @Test
    void createsDeterministicEmptyResponseManifest() {
        OpinionMapSnapshotManifest first = factory.create(
                snapshot(0), List.of());
        OpinionMapSnapshotManifest second = factory.create(
                snapshot(0), List.of());

        assertThat(second).isEqualTo(first);
        assertThat(first.responseCount()).isZero();
        assertThat(first.optionCounts()).isEmpty();
    }

    @Test
    void rejectsIncompleteOrForeignTaskResponseList() {
        assertThatThrownBy(() -> factory.create(
                snapshot(2),
                List.of(response(10, FIRST_OPTION_ID, "이유"))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("responseCount");

        OpinionMapSubmissionProjection foreign = new OpinionMapSubmissionProjection(
                uuid(10),
                "user-10",
                uuid(999),
                uuid(11),
                uuid(12),
                uuid(13),
                uuid(14),
                FIRST_OPTION_ID,
                OpinionMapReasonSource.USER_WRITTEN,
                null,
                "이유",
                SUBMITTED_AT);
        assertThatThrownBy(() -> factory.create(
                snapshot(1), List.of(foreign)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("snapshot task");
    }

    private static OpinionMapSnapshot snapshot(int responseCount) {
        return new OpinionMapSnapshot(
                SNAPSHOT_ID,
                TASK_ID,
                OpinionMapTaskClosureType.DEADLINE_REACHED,
                SUBMITTED_AT.plusSeconds(1),
                responseCount,
                responseCount,
                SUBMITTED_AT.plusSeconds(2));
    }

    private static OpinionMapSubmissionProjection response(
            long suffix,
            UUID optionId,
            String reason
    ) {
        return new OpinionMapSubmissionProjection(
                uuid(suffix),
                "user-" + suffix,
                TASK_ID,
                uuid(suffix + 100),
                uuid(suffix + 200),
                uuid(suffix + 300),
                uuid(suffix + 400),
                optionId,
                OpinionMapReasonSource.USER_WRITTEN,
                null,
                reason,
                SUBMITTED_AT.plusSeconds(suffix));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13140000-0000-0000-0000-%012d".formatted(suffix));
    }
}
