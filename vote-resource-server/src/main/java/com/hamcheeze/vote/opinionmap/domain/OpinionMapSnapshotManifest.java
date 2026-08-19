package com.hamcheeze.vote.opinionmap.domain;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public record OpinionMapSnapshotManifest(
        UUID snapshotId,
        String responseHashFormat,
        String responseHashSha256,
        int responseCount,
        List<OpinionMapOptionCount> optionCounts
) {

    private static final Pattern SHA_256_HEX =
            Pattern.compile("[0-9a-f]{64}");
    public static final String HASH_FORMAT_V1 =
            "opinion-map-response-set-v1";

    public OpinionMapSnapshotManifest {
        Objects.requireNonNull(snapshotId, "snapshotId");
        Objects.requireNonNull(responseHashFormat, "responseHashFormat");
        if (!HASH_FORMAT_V1.equals(responseHashFormat)) {
            throw new IllegalArgumentException(
                    "unsupported responseHashFormat: "
                            + responseHashFormat);
        }
        Objects.requireNonNull(responseHashSha256, "responseHashSha256");
        if (!SHA_256_HEX.matcher(responseHashSha256).matches()) {
            throw new IllegalArgumentException(
                    "responseHashSha256 must be lowercase SHA-256 hex");
        }
        if (responseCount < 0) {
            throw new IllegalArgumentException(
                    "responseCount must not be negative");
        }
        optionCounts = List.copyOf(Objects.requireNonNull(
                optionCounts, "optionCounts"));
        int countedResponses = 0;
        String previousOptionId = null;
        for (OpinionMapOptionCount optionCount : optionCounts) {
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
}
