package com.hamcheeze.chat.message.search;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SemaphoreChatMessageSearchConcurrencyGuardTest {

    @Test
    void rejectsAboveLimitAndReleasesPermitExactlyOnce() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SemaphoreChatMessageSearchConcurrencyGuard guard =
                new SemaphoreChatMessageSearchConcurrencyGuard(
                        2,
                        registry);

        ChatMessageSearchConcurrencyGuard.Permit first =
                guard.tryAcquire();
        ChatMessageSearchConcurrencyGuard.Permit second =
                guard.tryAcquire();
        ChatMessageSearchConcurrencyGuard.Permit rejected =
                guard.tryAcquire();

        assertThat(first.acquired()).isTrue();
        assertThat(second.acquired()).isTrue();
        assertThat(rejected.acquired()).isFalse();
        assertThat(guard.activeSearches()).isEqualTo(2);
        assertThat(registry.get("chat.message.search.concurrent")
                .gauge().value()).isEqualTo(2);

        first.close();
        first.close();
        assertThat(guard.activeSearches()).isEqualTo(1);
        ChatMessageSearchConcurrencyGuard.Permit replacement =
                guard.tryAcquire();
        assertThat(replacement.acquired()).isTrue();

        replacement.close();
        second.close();
        rejected.close();
        assertThat(guard.activeSearches()).isZero();
    }
}
