package com.hamcheeze.vote.task.application.research;

import java.util.Arrays;
import java.util.Objects;

public record ResearchTaskExportArtifact(
        byte[] content,
        String sha256,
        int participantCount,
        int predictionCount
) {

    public static final String SCHEMA_VERSION =
            "research-task-export/v1";
    public static final String CONTENT_TYPE = "application/zip";

    public ResearchTaskExportArtifact {
        content = Arrays.copyOf(
                Objects.requireNonNull(content, "content"),
                content.length);
        Objects.requireNonNull(sha256, "sha256");
        if (participantCount < 0 || predictionCount < 0) {
            throw new IllegalArgumentException(
                    "export counts must not be negative");
        }
    }

    @Override
    public byte[] content() {
        return Arrays.copyOf(content, content.length);
    }
}
