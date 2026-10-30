package com.hamcheeze.chat.websocket.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.ArrayList;
import java.util.List;

@Validated
@ConfigurationProperties("chat.websocket.rate-limit")
public class ChatAdmissionProperties {

    @Valid
    private User user = new User();
    @Valid
    private GlobalSource globalSource = new GlobalSource();

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public GlobalSource getGlobalSource() {
        return globalSource;
    }

    public void setGlobalSource(GlobalSource globalSource) {
        this.globalSource = globalSource;
    }

    public static class User {
        @Min(1)
        private int capacity = 5;
        @Min(1)
        private int refillTokens = 1;
        @Min(1)
        private long refillPeriodMs = 1_000;
        @Min(0)
        private long bucketIdleTtlMs;
        @NotEmpty
        private List<@Valid TokenCostTier> tokenCostTiers =
                new ArrayList<>(List.of(
                new TokenCostTier(50, 1),
                new TokenCostTier(100, 2),
                new TokenCostTier(200, 3),
                new TokenCostTier(500, 4),
                new TokenCostTier(2_000, 5)
        ));

        public int getCapacity() {
            return capacity;
        }

        public void setCapacity(int capacity) {
            this.capacity = capacity;
        }

        public int getRefillTokens() {
            return refillTokens;
        }

        public void setRefillTokens(int refillTokens) {
            this.refillTokens = refillTokens;
        }

        public long getRefillPeriodMs() {
            return refillPeriodMs;
        }

        public void setRefillPeriodMs(long refillPeriodMs) {
            this.refillPeriodMs = refillPeriodMs;
        }

        public long getBucketIdleTtlMs() {
            return bucketIdleTtlMs;
        }

        public void setBucketIdleTtlMs(long bucketIdleTtlMs) {
            this.bucketIdleTtlMs = bucketIdleTtlMs;
        }

        public List<TokenCostTier> getTokenCostTiers() {
            return tokenCostTiers;
        }

        public void setTokenCostTiers(List<TokenCostTier> tiers) {
            this.tokenCostTiers = new ArrayList<>(tiers);
        }
    }

    public static class GlobalSource {
        @Min(1)
        private long sustainedWindowMs = 10_000;
        @Min(1)
        private int sustainedMaxAccepted = 500;
        @Min(1)
        private long burstWindowMs = 1_000;
        @Min(1)
        private int burstMaxAccepted = 100;

        public long getSustainedWindowMs() {
            return sustainedWindowMs;
        }

        public void setSustainedWindowMs(long value) {
            this.sustainedWindowMs = value;
        }

        public int getSustainedMaxAccepted() {
            return sustainedMaxAccepted;
        }

        public void setSustainedMaxAccepted(int value) {
            this.sustainedMaxAccepted = value;
        }

        public long getBurstWindowMs() {
            return burstWindowMs;
        }

        public void setBurstWindowMs(long value) {
            this.burstWindowMs = value;
        }

        public int getBurstMaxAccepted() {
            return burstMaxAccepted;
        }

        public void setBurstMaxAccepted(int value) {
            this.burstMaxAccepted = value;
        }
    }

    public static class TokenCostTier {
        @Min(1)
        private int maxCodePoints;
        @Min(1)
        private int cost;

        public TokenCostTier() {
        }

        public TokenCostTier(int maxCodePoints, int cost) {
            this.maxCodePoints = maxCodePoints;
            this.cost = cost;
        }

        public int getMaxCodePoints() {
            return maxCodePoints;
        }

        public void setMaxCodePoints(int maxCodePoints) {
            this.maxCodePoints = maxCodePoints;
        }

        public int getCost() {
            return cost;
        }

        public void setCost(int cost) {
            this.cost = cost;
        }
    }
}
