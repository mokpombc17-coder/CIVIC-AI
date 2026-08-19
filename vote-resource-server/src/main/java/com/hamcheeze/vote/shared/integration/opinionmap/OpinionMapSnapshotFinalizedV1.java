package com.hamcheeze.vote.shared.integration.opinionmap;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public record OpinionMapSnapshotFinalizedV1(
        UUID snapshotId,
        UUID taskId,
        ClosureType closureType,
        Instant closedAt,
        Instant finalizedAt,
        int expectedSubmissionCount,
        int responseCount,
        String responseHashFormat,
        String responseHashSha256,
        List<OptionCount> optionCounts
) {

    public static final String EVENT_TYPE =
            "opinion-map.snapshot-finalized";
    public static final String AGGREGATE_TYPE = "OPINION_MAP_SNAPSHOT";
    public static final int SCHEMA_VERSION = 1;
    public static final String RESPONSE_HASH_FORMAT =
            "opinion-map-response-set-v1";

    private static final Pattern SHA_256_HEX =
            Pattern.compile("[0-9a-f]{64}");

    public OpinionMapSnapshotFinalizedV1 {
        Objects.requireNonNull(snapshotId, "snapshotId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(closureType, "closureType");
        Objects.requireNonNull(closedAt, "closedAt");
        Objects.requireNonNull(finalizedAt, "finalizedAt");
        closedAt = closedAt.truncatedTo(ChronoUnit.MICROS);
        finalizedAt = finalizedAt.truncatedTo(ChronoUnit.MICROS);
        if (finalizedAt.isBefore(closedAt)) {
            throw new IllegalArgumentException(
                    "finalizedAt must not be before closedAt");
        }
        if (expectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "expectedSubmissionCount must not be negative");
        }
        if (responseCount != expectedSubmissionCount) {
            throw new IllegalArgumentException(
                    "responseCount must match expectedSubmissionCount");
        }
        if (!RESPONSE_HASH_FORMAT.equals(responseHashFormat)) {
            throw new IllegalArgumentException(
                    "unsupported responseHashFormat: "
                            + responseHashFormat);
        }
        Objects.requireNonNull(responseHashSha256, "responseHashSha256");
        if (!SHA_256_HEX.matcher(responseHashSha256).matches()) {
            throw new IllegalArgumentException(
                    "responseHashSha256 must be lowercase SHA-256 hex");
        }
        optionCounts = List.copyOf(Objects.requireNonNull(
                optionCounts, "optionCounts"));
        int countedResponses = 0;
        String previousOptionId = null;
        for (OptionCount optionCount : optionCounts) {
            Objects.requireNonNull(optionCount, "optionCount");
            String currentOptionId = optionCount.optionId().toString();
            if (previousOptionId != null
                    && previousOptionId.compareTo(currentOptionId) >= 0) {
                throw new IllegalArgumentException(
                        "optionCounts must be uniquely sorted by optionId");
            }
            countedResponses = Math.addExact(
                    countedResponses, optionCount.responseCount());
            previousOptionId = currentOptionId;
        }
        if (countedResponses != responseCount) {
            throw new IllegalArgumentException(
                    "optionCounts must sum to responseCount");
        }
    }

    public enum ClosureType {
        DEADLINE_REACHED,
        EARLY_CLOSED
    }

    public record OptionCount(
            UUID optionId,
            int responseCount
    ) {

        public OptionCount {
            Objects.requireNonNull(optionId, "optionId");
            if (responseCount <= 0) {
                throw new IllegalArgumentException(
                        "responseCount must be positive");
            }
        }
    }
}
