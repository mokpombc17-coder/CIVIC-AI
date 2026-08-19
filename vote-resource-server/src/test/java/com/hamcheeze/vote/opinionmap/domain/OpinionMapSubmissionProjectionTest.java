package com.hamcheeze.vote.opinionmap.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapSubmissionProjectionTest {

    @Test
    void preservesAcceptedReasonSnapshotAndNormalizesTimestamp() {
        OpinionMapSubmissionProjection submission = submission(
                OpinionMapReasonSource.AI_ACCEPTED, uuid(9), "채택 당시 이유");

        assertThat(submission.acceptedPredictedReason()).isTrue();
        assertThat(submission.questionId()).isEqualTo(uuid(7));
        assertThat(submission.selectedOptionId()).isEqualTo(uuid(8));
        assertThat(submission.acceptedPredictedReasonId()).isEqualTo(uuid(9));
        assertThat(submission.finalReason()).isEqualTo("채택 당시 이유");
        assertThat(submission.submittedAt()).isEqualTo(
                Instant.parse("2026-08-19T00:00:00.123456789Z")
                        .truncatedTo(ChronoUnit.MICROS));
    }

    @Test
    void userWrittenReasonMustNotReferencePredictedReason() {
        assertThatThrownBy(() -> submission(
                OpinionMapReasonSource.USER_WRITTEN, uuid(9), "직접 작성"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not have predicted reason ID");
    }

    @Test
    void finalReasonMustBeNonBlankAndTrimmed() {
        assertThatThrownBy(() -> submission(
                OpinionMapReasonSource.USER_WRITTEN, null, " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> submission(
                OpinionMapReasonSource.USER_WRITTEN, null, " 이유 "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static OpinionMapSubmissionProjection submission(
            OpinionMapReasonSource source,
            UUID acceptedReasonId,
            String finalReason
    ) {
        return new OpinionMapSubmissionProjection(
                uuid(1), "user-a", uuid(2), uuid(3), uuid(4), uuid(5),
                uuid(7), uuid(8), source, acceptedReasonId, finalReason,
                Instant.parse("2026-08-19T00:00:00.123456789Z"));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13110000-0000-0000-0000-%012d".formatted(suffix));
    }
}
