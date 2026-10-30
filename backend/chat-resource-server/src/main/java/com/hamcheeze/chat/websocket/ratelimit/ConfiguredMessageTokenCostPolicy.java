package com.hamcheeze.chat.websocket.ratelimit;

import com.hamcheeze.chat.websocket.config.ChatAdmissionProperties;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

@Component
public final class ConfiguredMessageTokenCostPolicy
        implements MessageTokenCostPolicy {

    private final List<ChatAdmissionProperties.TokenCostTier> tiers;

    public ConfiguredMessageTokenCostPolicy(ChatAdmissionProperties properties) {
        this.tiers = properties.getUser().getTokenCostTiers().stream()
                .sorted(Comparator.comparingInt(
                        ChatAdmissionProperties.TokenCostTier::getMaxCodePoints))
                .toList();
    }

    @Override
    public int calculate(int codePointCount) {
        if (codePointCount < 1) {
            throw new IllegalArgumentException("codePointCount must be positive");
        }
        return tiers.stream()
                .filter(tier -> codePointCount <= tier.getMaxCodePoints())
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "No token cost tier for " + codePointCount))
                .getCost();
    }
}
