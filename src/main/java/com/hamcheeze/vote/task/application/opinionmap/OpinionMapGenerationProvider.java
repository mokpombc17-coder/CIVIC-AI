package com.hamcheeze.vote.task.application.opinionmap;

public record OpinionMapGenerationProvider(
        String provider,
        String requestedModel
) {

    public OpinionMapGenerationProvider {
        provider = requireText(provider, "provider");
        requestedModel = requireText(requestedModel, "requestedModel");
    }

    public static OpinionMapGenerationProvider unknown() {
        return new OpinionMapGenerationProvider("unknown", "unknown");
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value.trim();
    }
}
