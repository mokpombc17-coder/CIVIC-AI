package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;

import java.math.BigDecimal;
import java.util.Objects;

public record OpinionMapGenerationGatewayResult(
        OpinionMapOptionExplanationV1 output,
        String provider,
        String requestedModel,
        String responseModel,
        String providerGenerationId,
        String providerRequestId,
        Long promptTokens,
        Long completionTokens,
        Long totalTokens,
        Long cachedTokens,
        Long reasoningTokens,
        BigDecimal cost,
        String currency,
        String finishReason,
        Integer httpStatus
) {

    public OpinionMapGenerationGatewayResult {
        Objects.requireNonNull(output, "output");
        provider = requireText(provider, "provider");
        requestedModel = requireText(requestedModel, "requestedModel");
        responseModel = normalize(responseModel);
        providerGenerationId = normalize(providerGenerationId);
        providerRequestId = normalize(providerRequestId);
        finishReason = normalize(finishReason);
        currency = normalize(currency);
        requireNonNegative(promptTokens, "promptTokens");
        requireNonNegative(completionTokens, "completionTokens");
        requireNonNegative(totalTokens, "totalTokens");
        requireNonNegative(cachedTokens, "cachedTokens");
        requireNonNegative(reasoningTokens, "reasoningTokens");
        if (cost != null && cost.signum() < 0) {
            throw new IllegalArgumentException("cost must not be negative");
        }
        if ((cost == null) != (currency == null)) {
            throw new IllegalArgumentException(
                    "cost and currency must both be present or absent");
        }
    }

    public static OpinionMapGenerationGatewayResult unmetered(
            OpinionMapOptionExplanationV1 output,
            OpinionMapGenerationProvider provider
    ) {
        return new OpinionMapGenerationGatewayResult(
                output,
                provider.provider(),
                provider.requestedModel(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    private static String requireText(String value, String field) {
        String normalized = normalize(value);
        if (normalized == null) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return normalized;
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static void requireNonNegative(Long value, String field) {
        if (value != null && value < 0) {
            throw new IllegalArgumentException(
                    field + " must not be negative");
        }
    }
}
