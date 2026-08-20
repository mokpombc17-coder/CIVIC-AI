package com.hamcheeze.vote.task.infra.prediction;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;

@Component
public class TaskPredictionConfigurationValidator
        implements InitializingBean {

    private final TaskPredictionProperties properties;
    private final Environment environment;

    public TaskPredictionConfigurationValidator(
            TaskPredictionProperties properties,
            Environment environment
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.environment = Objects.requireNonNull(environment, "environment");
    }

    @Override
    public void afterPropertiesSet() {
        if (!properties.isEnabled()) {
            return;
        }
        positive(properties.getConnectTimeout(),
                "vote.task.prediction.connect-timeout");
        positive(properties.getRequestTimeout(),
                "vote.task.prediction.request-timeout");
        positive(properties.getProcessingLeaseDuration(),
                "vote.task.prediction.processing-lease-duration");
        Duration leaseMargin = properties.getProcessingLeaseDuration().minus(
                properties.getRequestTimeout());
        if (leaseMargin.isZero() || leaseMargin.isNegative()) {
            invalid("vote.task.prediction.processing-lease-duration",
                    "must be greater than vote.task.prediction.request-timeout");
        }
        positive(properties.getRetryDelay(),
                "vote.task.prediction.retry-delay");
        positive(properties.getDispatcherDelay(),
                "vote.task.prediction.dispatcher-delay");
        positive(properties.getLeaseReaperDelay(),
                "vote.task.prediction.lease-reaper-delay");
        nonNegative(properties.getWorkerShutdownAwait(),
                "vote.task.prediction.worker-shutdown-await");
        atLeastOne(properties.getMaximumAttempts(),
                "vote.task.prediction.maximum-attempts");
        atLeastOne(properties.getBatchSize(),
                "vote.task.prediction.batch-size");
        atLeastOne(properties.getWorkerPoolSize(),
                "vote.task.prediction.worker-pool-size");
        if (properties.getWorkerQueueCapacity() < 0) {
            invalid("vote.task.prediction.worker-queue-capacity",
                    "must not be negative");
        }
        required(properties.getCandidatePolicyVersion(),
                "vote.task.prediction.candidate-policy-version");

        String provider = required(properties.getProvider(),
                "vote.task.prediction.provider").toLowerCase(Locale.ROOT);
        boolean production = environment.acceptsProfiles(
                Profiles.of("prod"));
        if (!provider.equals("http")
                && !(provider.equals("fake") && !production)) {
            invalid("vote.task.prediction.provider",
                    production
                            ? "prod supports only the http provider"
                            : "must be http or fake");
        }
        if (provider.equals("http")) {
            validateBaseUrl(properties.getBaseUrl(), production);
        }
    }

    private static void validateBaseUrl(String raw, boolean production) {
        String value = required(raw, "vote.task.prediction.base-url");
        final URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "Invalid vote.task.prediction.base-url: must be a valid URI",
                    exception);
        }
        if (!uri.isAbsolute()
                || !("http".equalsIgnoreCase(uri.getScheme())
                || "https".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null) {
            invalid("vote.task.prediction.base-url",
                    "must be an absolute HTTP(S) URI with a host and without userinfo, query, or fragment");
        }
        if (production && unsafeHost(uri.getHost())) {
            invalid("vote.task.prediction.base-url",
                    "prod must not use a loopback or any-local host");
        }
    }

    private static boolean unsafeHost(String rawHost) {
        String host = rawHost.toLowerCase(Locale.ROOT)
                .replace("[", "").replace("]", "");
        return host.equals("localhost")
                || host.endsWith(".localhost")
                || host.startsWith("127.")
                || host.equals("0.0.0.0")
                || host.equals("::1")
                || host.equals("0:0:0:0:0:0:0:1")
                || host.equals("::")
                || host.equals("0:0:0:0:0:0:0:0");
    }

    private static void positive(Duration value, String key) {
        if (value == null || value.isZero() || value.isNegative()) {
            invalid(key, "must be positive");
        }
    }

    private static void nonNegative(Duration value, String key) {
        if (value == null || value.isNegative()) {
            invalid(key, "must not be negative");
        }
    }

    private static void atLeastOne(int value, String key) {
        if (value < 1) {
            invalid(key, "must be at least 1");
        }
    }

    private static String required(String value, String key) {
        if (value == null || value.isBlank()) {
            invalid(key, "must not be blank");
        }
        return value.strip();
    }

    private static void invalid(String key, String reason) {
        throw new IllegalStateException("Invalid " + key + ": " + reason
                + "; otherwise TaskPrediction can remain unavailable or stuck");
    }
}
