package com.hamcheeze.vote.persona.infra;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
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
    void disabledProductionSkipsProviderAndWorkerValidationWhenOutboxIsOff() {
        PersonaGenerationProperties properties = valid();
        properties.setEnabled(false);
        properties.setBaseUrl("");
        properties.setWorkerPoolSize(0);

        assertThatCode(() -> validator(
                "prod", properties, false).afterSingletonsInstantiated())
                .doesNotThrowAnyException();
    }

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

    @ParameterizedTest
    @ValueSource(strings = {
            "http://127.0.0.1:8090",
            "http://[::1]:8090",
            "http://0.0.0.0:8090",
            "http://[::]:8090",
            "https://user:secret@persona.example",
            "https://persona.example?tenant=a",
            "https://persona.example#fragment"
    })
    void productionRejectsUnsafeOrAmbiguousBaseUrls(String baseUrl) {
        PersonaGenerationProperties properties = valid();
        properties.setBaseUrl(baseUrl);

        assertThatThrownBy(() -> validator(
                "prod", properties, true).afterSingletonsInstantiated())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vote.persona.base-url");
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

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void legacyEnvironmentAliasEmitsDeprecationWarning(
            CapturedOutput output
    ) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        environment.setProperty("VOTE_SURVEY_PERSONA_BASE_URL",
                "https://legacy.example");

        new PersonaGenerationConfigurationValidator(
                environment, valid(), true).afterSingletonsInstantiated();

        assertThat(output).contains("VOTE_SURVEY_PERSONA_*")
                .contains("VOTE_PERSONA_*")
                .contains("Deprecated");
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
