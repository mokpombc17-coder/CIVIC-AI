package com.hamcheeze.vote.task.infra.preparation;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;

@Component
public class TaskPreparationConfigurationValidator
        implements InitializingBean {

    private final TaskPreparationProperties properties;
    private final Environment environment;

    public TaskPreparationConfigurationValidator(
            TaskPreparationProperties properties,
            Environment environment
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.environment = Objects.requireNonNull(environment, "environment");
    }

    @Override
    public void afterPropertiesSet() {
        positive(properties.getRetryDelay(),
                "vote.task.preparation.retry-delay");
        positive(properties.getProcessingLeaseDuration(),
                "vote.task.preparation.processing-lease-duration");
        if (!properties.isEnabled()) {
            return;
        }
        positive(properties.getConnectTimeout(),
                "vote.task.preparation.connect-timeout");
        positive(properties.getRequestTimeout(),
                "vote.task.preparation.request-timeout");
        if (!properties.getProcessingLeaseDuration().minus(
                properties.getRequestTimeout()).isPositive()) {
            invalid("vote.task.preparation.processing-lease-duration",
                    "must be greater than request-timeout");
        }
        String provider = required(properties.getProvider(),
                "vote.task.preparation.provider");
        boolean production = environment.acceptsProfiles(
                Profiles.of("prod"));
        if (!provider.equals("http")
                && !(provider.equals("fake") && !production)) {
            invalid("vote.task.preparation.provider",
                    production
                            ? "allowed value: http"
                            : "allowed values: http, fake");
        }
        if (provider.equals("http")) {
            validateBaseUrl(properties.getBaseUrl(), production);
            required(properties.getPath(), "vote.task.preparation.path");
        }
    }

    private static void validateBaseUrl(String raw, boolean production) {
        String value = required(raw, "vote.task.preparation.base-url");
        final URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "Invalid vote.task.preparation.base-url", exception);
        }
        if (!uri.isAbsolute()
                || !(uri.getScheme().equalsIgnoreCase("http")
                || uri.getScheme().equalsIgnoreCase("https"))
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null) {
            invalid("vote.task.preparation.base-url",
                    "must be an absolute HTTP(S) URI with a host");
        }
        if (production && unsafeHost(uri.getHost())) {
            invalid("vote.task.preparation.base-url",
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

    private static String required(String value, String key) {
        if (value == null || value.isBlank()) {
            invalid(key, "must not be blank");
        }
        return value.strip();
    }

    private static void invalid(String key, String reason) {
        throw new IllegalStateException(
                "Invalid " + key + ": " + reason);
    }
}
