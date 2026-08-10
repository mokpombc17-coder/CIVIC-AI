package com.hamcheeze.chat.message.search;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageSearchCriteriaTest {

    private final ChatMessageSearchNormalizer normalizer =
            new ChatMessageSearchNormalizer();
    private final ChatMessageSearchProperties properties =
            new ChatMessageSearchProperties();

    @Test
    void resolvesCanonicalQueryFingerprintAndDefaultLimit() {
        ChatMessageSearchCriteria criteria =
                ChatMessageSearchCriteria.resolve(
                        "  환경\u2003정책 ",
                        null,
                        normalizer,
                        properties);

        assertThat(criteria.normalizedQuery())
                .isEqualTo("환경 정책");
        assertThat(criteria.normalizedQueryFingerprint())
                .isEqualTo(normalizer.fingerprint("환경 정책"));
        assertThat(criteria.resultLimit()).isEqualTo(20);
    }

    @Test
    void acceptsConfiguredLimitAtBothBoundaries() {
        assertThat(resolveLimit(1)).isEqualTo(1);
        assertThat(resolveLimit(50)).isEqualTo(50);
    }

    @Test
    void rejectsLimitOutsideConfiguredRange() {
        assertThatThrownBy(() -> resolveLimit(0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> resolveLimit(51))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private int resolveLimit(int limit) {
        return ChatMessageSearchCriteria.resolve(
                        "환경",
                        limit,
                        normalizer,
                        properties)
                .resultLimit();
    }
}
