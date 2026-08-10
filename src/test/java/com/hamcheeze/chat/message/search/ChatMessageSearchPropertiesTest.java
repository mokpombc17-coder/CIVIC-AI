package com.hamcheeze.chat.message.search;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class ChatMessageSearchPropertiesTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            SearchPropertiesConfiguration.class);

    @Test
    void providesBoundedSearchDefaults() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            ChatMessageSearchProperties properties = context.getBean(
                    ChatMessageSearchProperties.class);
            assertThat(properties.getDefaultResultLimit()).isEqualTo(20);
            assertThat(properties.getMaxResultLimit()).isEqualTo(50);
            assertThat(properties.getCandidateChunkSize()).isEqualTo(500);
            assertThat(properties.getMaxScannedPerRequest())
                    .isEqualTo(2_000);
            assertThat(properties.getRequestDeadline())
                    .isEqualTo(Duration.ofSeconds(1));
            assertThat(properties.getMongoQueryMaxTime())
                    .isEqualTo(Duration.ofMillis(500));
            assertThat(properties.getCursorTtl())
                    .isEqualTo(Duration.ofMinutes(10));
            assertThat(properties.getMaxConcurrentSearches()).isEqualTo(4);
            assertThat(properties.getUserRateLimitPerSecond()).isEqualTo(1);
            assertThat(properties.getUserRateLimitBurst()).isEqualTo(3);
        });
    }

    @Test
    void acceptsConsistentOverrides() {
        contextRunner.withPropertyValues(
                        "chat.message.search.default-result-limit=10",
                        "chat.message.search.max-result-limit=25",
                        "chat.message.search.candidate-chunk-size=100",
                        "chat.message.search.max-scanned-per-request=500",
                        "chat.message.search.request-deadline=2s",
                        "chat.message.search.mongo-query-max-time=1s",
                        "chat.message.search.cursor-ttl=5m")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    ChatMessageSearchProperties properties =
                            context.getBean(
                                    ChatMessageSearchProperties.class);
                    assertThat(properties.getDefaultResultLimit())
                            .isEqualTo(10);
                    assertThat(properties.getCursorTtl())
                            .isEqualTo(Duration.ofMinutes(5));
                });
    }

    @Test
    void rejectsDefaultLimitAboveMaximum() {
        assertInvalid(
                "chat.message.search.default-result-limit=30",
                "chat.message.search.max-result-limit=20",
                "defaultResultLimit");
    }

    @Test
    void rejectsChunkSizeAboveScanBudget() {
        assertInvalid(
                "chat.message.search.candidate-chunk-size=501",
                "chat.message.search.max-scanned-per-request=500",
                "candidateChunkSize");
    }

    @Test
    void rejectsMongoMaxTimeAboveRequestDeadline() {
        assertInvalid(
                "chat.message.search.request-deadline=500ms",
                "chat.message.search.mongo-query-max-time=501ms",
                "mongoQueryMaxTime");
    }

    private void assertInvalid(
            String firstProperty,
            String secondProperty,
            String expectedMessage
    ) {
        contextRunner.withPropertyValues(firstProperty, secondProperty)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(rootCause(context.getStartupFailure()))
                            .isInstanceOf(IllegalArgumentException.class)
                            .hasMessageContaining(expectedMessage);
                });
    }

    private Throwable rootCause(Throwable failure) {
        Throwable cause = failure;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ChatMessageSearchProperties.class)
    static class SearchPropertiesConfiguration {
    }
}
