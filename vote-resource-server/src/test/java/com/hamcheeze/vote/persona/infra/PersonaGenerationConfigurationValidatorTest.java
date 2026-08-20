package com.hamcheeze.vote.persona.infra;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySourcesPropertyResolver;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonaGenerationConfigurationValidatorTest {

    @Test
    void productionRejectsOutboxEnabledWithoutPersonaWorker() {
        PersonaGenerationProperties properties = valid();
        properties.setEnabled(false);

        assertThatThrownBy(() -> validator(
                "prod", properties, true).afterSingletonsInstantiated())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vote.integration.outbox.enabled=true")
                .hasMessageContaining("vote.persona.enabled=false")
                .hasMessageContaining("permanently PENDING");
    }

    @Test
    void productionRejectsFakeProviderAndLocalBaseUrl() {
        PersonaGenerationProperties fake = valid();
        fake.setProvider("fake");
        assertThatThrownBy(() -> validator(
                "prod", fake, true).afterSingletonsInstantiated())
                .hasMessageContaining("vote.persona.provider");

        PersonaGenerationProperties local = valid();
        local.setBaseUrl("http://localhost:8090");
        assertThatThrownBy(() -> validator(
                "prod", local, true).afterSingletonsInstantiated())
                .hasMessageContaining("vote.persona.base-url")
                .hasMessageContaining("VOTE_PERSONA_BASE_URL");

        PersonaGenerationProperties missing = valid();
        missing.setBaseUrl("");
        assertThatThrownBy(() -> validator(
                "prod", missing, true).afterSingletonsInstantiated())
                .hasMessageContaining("vote.persona.base-url")
                .hasMessageContaining("VOTE_PERSONA_BASE_URL");
    }

    @Test
    void enabledLocalConfigurationRejectsMissingProvider() {
        PersonaGenerationProperties none = valid();
        none.setProvider("none");

        assertThatThrownBy(() -> validator(
                "local", none, true).afterSingletonsInstantiated())
                .hasMessageContaining("vote.persona.provider")
                .hasMessageContaining("remain PENDING")
                .hasMessageContaining("vote.persona.enabled=false");
    }

    @Test
    void rejectsLeaseRetryAndExecutorSettingsAtStartup() {
        PersonaGenerationProperties lease = valid();
        lease.setProcessingLeaseDuration(lease.getRequestTimeout());
        assertThatThrownBy(() -> validator(
                "prod", lease, true).afterSingletonsInstantiated())
                .hasMessageContaining("processing-lease-duration")
                .hasMessageContaining("request-timeout");

        PersonaGenerationProperties queue = valid();
        queue.setWorkerQueueCapacity(-1);
        assertThatThrownBy(() -> validator(
                "prod", queue, true).afterSingletonsInstantiated())
                .hasMessageContaining("worker-queue-capacity");

        PersonaGenerationProperties attempts = valid();
        attempts.setMaxAttempts(0);
        assertThatThrownBy(() -> validator(
                "prod", attempts, true).afterSingletonsInstantiated())
                .hasMessageContaining("max-attempts");
    }

    @Test
    void testCanDisableAndLocalCanUseFakeWhileValidProdStarts() {
        PersonaGenerationProperties disabled = valid();
        disabled.setEnabled(false);
        assertThatCode(() -> validator(
                "test", disabled, true).afterSingletonsInstantiated())
                .doesNotThrowAnyException();

        PersonaGenerationProperties local = valid();
        local.setProvider("fake");
        local.setBaseUrl("http://localhost:8090");
        assertThatCode(() -> validator(
                "local", local, true).afterSingletonsInstantiated())
                .doesNotThrowAnyException();

        assertThatCode(() -> validator(
                "prod", valid(), true).afterSingletonsInstantiated())
                .doesNotThrowAnyException();
    }

    @Test
    void authoritativePersonaEnvironmentKeyWinsOverLegacyAlias()
            throws IOException {
        assertThat(resolveBaseEnabled(Map.of(
                "VOTE_PERSONA_ENABLED", "true",
                "VOTE_SURVEY_PERSONA_ENABLED", "false")))
                .isEqualTo("true");
        assertThat(resolveBaseEnabled(Map.of(
                "VOTE_SURVEY_PERSONA_ENABLED", "true")))
                .isEqualTo("true");
    }

    private static String resolveBaseEnabled(Map<String, Object> overrides)
            throws IOException {
        MutablePropertySources sources = new MutablePropertySources();
        sources.addFirst(new MapPropertySource("test-overrides", overrides));
        new YamlPropertySourceLoader().load(
                        "application",
                        new ClassPathResource("application.yaml"))
                .forEach(sources::addLast);
        return new PropertySourcesPropertyResolver(sources)
                .getProperty("vote.persona.enabled");
    }

    private static PersonaGenerationConfigurationValidator validator(
            String profile,
            PersonaGenerationProperties properties,
            boolean outboxEnabled
    ) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        return new PersonaGenerationConfigurationValidator(
                environment, properties, outboxEnabled);
    }

    private static PersonaGenerationProperties valid() {
        PersonaGenerationProperties properties =
                new PersonaGenerationProperties();
        properties.setEnabled(true);
        properties.setProvider("http");
        properties.setBaseUrl("https://persona-ai.internal.example");
        properties.setConnectTimeout(Duration.ofSeconds(5));
        properties.setRequestTimeout(Duration.ofSeconds(60));
        properties.setProcessingLeaseDuration(Duration.ofSeconds(90));
        properties.setLeaseReaperDelay(Duration.ofSeconds(10));
        properties.setRetryInitialDelay(Duration.ofSeconds(30));
        properties.setRetryMaxDelay(Duration.ofMinutes(2));
        properties.setMaxAttempts(3);
        properties.setBatchSize(10);
        properties.setWorkerPoolSize(4);
        properties.setWorkerQueueCapacity(20);
        properties.setWorkerShutdownAwait(Duration.ofSeconds(30));
        return properties;
    }
}
