package com.hamcheeze.vote.persona.infra;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;
import java.util.Objects;

@Component
public class PersonaGenerationConfigurationValidator
        implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(
            PersonaGenerationConfigurationValidator.class);

    private final Environment environment;
    private final PersonaGenerationProperties properties;
    private final boolean outboxEnabled;

    public PersonaGenerationConfigurationValidator(
            Environment environment,
            PersonaGenerationProperties properties,
            @Value("${vote.integration.outbox.enabled:false}")
            boolean outboxEnabled
    ) {
        this.environment = Objects.requireNonNull(
                environment, "environment");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.outboxEnabled = outboxEnabled;
    }

    @Override
    public void afterSingletonsInstantiated() {
        if (environment.acceptsProfiles(Profiles.of("test"))) {
            return;
        }
        warnLegacyAliases();
        validateNumericSettings();
        boolean production = environment.acceptsProfiles(
                Profiles.of("prod"));
        if (production && outboxEnabled && !properties.isEnabled()) {
            throw invalid(
                    "vote.integration.outbox.enabled=true conflicts with "
                            + "vote.persona.enabled=false; "
                            + "SurveyResponseSubmitted creates Persona generations "
                            + "that remain permanently PENDING. Set "
                            + "vote.persona.enabled=true.");
        }
        if (!properties.isEnabled()) {
            return;
        }
        String provider = properties.getProvider();
        if (!"http".equalsIgnoreCase(provider)
                && !"fake".equalsIgnoreCase(provider)) {
            throw invalid(
                    "vote.persona.provider must be http or local fake when "
                            + "vote.persona.enabled=true; otherwise Persona "
                            + "generations remain PENDING. Configure a provider "
                            + "or set vote.persona.enabled=false.");
        }
        if (production) {
            if (!"http".equalsIgnoreCase(provider)) {
                throw invalid(
                        "vote.persona.provider must be http in prod; fake or "
                                + "none leaves production generations without "
                                + "a real AI worker.");
            }
            validateProductionBaseUrl();
        }
    }

    private void validateNumericSettings() {
        requirePositive(properties.getConnectTimeout(),
                "vote.persona.connect-timeout");
        requirePositive(properties.getRequestTimeout(),
                "vote.persona.request-timeout");
        requirePositive(properties.getDispatcherDelay(),
                "vote.persona.dispatcher-delay");
        requirePositive(properties.getProcessingLeaseDuration(),
                "vote.persona.processing-lease-duration");
        requirePositive(properties.getLeaseReaperDelay(),
                "vote.persona.lease-reaper-delay");
        requirePositive(properties.getRetryInitialDelay(),
                "vote.persona.retry-initial-delay");
        requirePositive(properties.getRetryMaxDelay(),
                "vote.persona.retry-max-delay");
        requireNonNegative(properties.getWorkerShutdownAwait(),
                "vote.persona.worker-shutdown-await");
        if (properties.getProcessingLeaseDuration().compareTo(
                properties.getRequestTimeout()) <= 0) {
            throw invalid(
                    "vote.persona.processing-lease-duration must be greater "
                            + "than vote.persona.request-timeout so an active "
                            + "AI request is not reclaimed prematurely.");
        }
        if (properties.getRetryMaxDelay().compareTo(
                properties.getRetryInitialDelay()) < 0) {
            throw invalid(
                    "vote.persona.retry-max-delay must be greater than or "
                            + "equal to vote.persona.retry-initial-delay.");
        }
        if (properties.getMaxAttempts() < 1) {
            throw invalid("vote.persona.max-attempts must be at least 1.");
        }
        if (properties.getBatchSize() < 1) {
            throw invalid("vote.persona.batch-size must be at least 1.");
        }
        if (properties.getWorkerPoolSize() < 1) {
            throw invalid("vote.persona.worker-pool-size must be at least 1.");
        }
        if (properties.getWorkerQueueCapacity() < 0) {
            throw invalid(
                    "vote.persona.worker-queue-capacity must not be negative.");
        }
    }

    private void validateProductionBaseUrl() {
        String value = properties.getBaseUrl();
        try {
            URI uri = URI.create(value == null ? "" : value);
            if (!uri.isAbsolute()
                    || !("http".equalsIgnoreCase(uri.getScheme())
                    || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null
                    || "localhost".equalsIgnoreCase(uri.getHost())
                    || "127.0.0.1".equals(uri.getHost())) {
                throw new IllegalArgumentException();
            }
        } catch (RuntimeException exception) {
            throw invalid(
                    "vote.persona.base-url must be a non-local absolute HTTP "
                            + "URL in prod. Configure VOTE_PERSONA_BASE_URL.");
        }
    }

    private void warnLegacyAliases() {
        if (environment.containsProperty("VOTE_SURVEY_PERSONA_ENABLED")
                || environment.containsProperty(
                "VOTE_SURVEY_PERSONA_PROVIDER")
                || environment.containsProperty(
                "VOTE_SURVEY_PERSONA_BASE_URL")) {
            log.warn(
                    "Deprecated VOTE_SURVEY_PERSONA_* configuration detected; use authoritative VOTE_PERSONA_* keys");
        }
    }

    private static void requirePositive(Duration value, String setting) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw invalid(setting + " must be greater than zero.");
        }
    }

    private static void requireNonNegative(Duration value, String setting) {
        if (value == null || value.isNegative()) {
            throw invalid(setting + " must not be negative.");
        }
    }

    private static IllegalStateException invalid(String detail) {
        return new IllegalStateException(
                "Invalid Persona generation configuration: " + detail);
    }
}
