package com.hamcheeze.chat.message.search;

import org.junit.jupiter.api.Test;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageSearchNormalizerTest {

    private final ChatMessageSearchNormalizer normalizer =
            new ChatMessageSearchNormalizer();

    @Test
    void rejectsNullBlankAndOneCodePointQueries() {
        assertThatThrownBy(() -> normalizer.normalizeQuery(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> normalizer.normalizeQuery(" \u2003 "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> normalizer.normalizeQuery("법"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void acceptsTwoAndOneHundredCodePointQueries() {
        assertThat(normalizer.normalizeQuery("AI")).isEqualTo("ai");
        assertThat(normalizer.normalizeQuery("가".repeat(100)))
                .hasSize(100);
    }

    @Test
    void boundsRawQueryByUtf16LengthBeforeNormalization() {
        String maximumRawQuery = "AI"
                + "\u2003".repeat(
                        ChatMessageSearchNormalizer
                                .MAX_RAW_QUERY_UTF16_LENGTH - 2);
        String oversizedRawQuery = maximumRawQuery + " ";

        assertThat(maximumRawQuery).hasSize(
                ChatMessageSearchNormalizer
                        .MAX_RAW_QUERY_UTF16_LENGTH);
        assertThat(normalizer.normalizeQuery(maximumRawQuery))
                .isEqualTo("ai");
        assertThatThrownBy(() -> normalizer.normalizeQuery(
                oversizedRawQuery))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("raw query is too long");
    }

    @Test
    void rejectsOneHundredOneCodePointQuery() {
        assertThatThrownBy(() -> normalizer.normalizeQuery(
                "가".repeat(101)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("100 code points");
    }

    @Test
    void rejectsRawIsoControlCharactersBeforeWhitespaceCollapse() {
        for (String query : new String[]{
                "정\t책",
                "\n정책",
                "정책\r",
                "정\u0000책"
        }) {
            assertThatThrownBy(() -> normalizer.normalizeQuery(query))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("control characters");
        }
    }

    @Test
    void trimsAndCollapsesUnicodeWhitespace() {
        assertThat(normalizer.normalizeQuery(
                " \u2003환경\u00a0 \u2009정책\u2003"))
                .isEqualTo("환경 정책");
    }

    @Test
    void processesSurrogatePairsWithoutSplittingCodePoints() {
        assertThat(normalizer.normalizeQuery("😀정"))
                .isEqualTo("😀정");
        assertThat(normalizer.normalizeContent("😀\n\t정"))
                .isEqualTo("😀 정");
    }

    @Test
    void appliesNfcAndLocaleRootLowercase() {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertThat(normalizer.normalizeQuery("E\u0301COLE I"))
                    .isEqualTo("école i");
        } finally {
            Locale.setDefault(original);
        }
    }

    @Test
    void preservesRegexMetacharactersAsLiteralText() {
        assertThat(normalizer.normalizeQuery(".* [정책]"))
                .isEqualTo(".* [정책]");
    }

    @Test
    void contentNormalizationTurnsLineBreaksIntoSpaces() {
        assertThat(normalizer.normalizeContent(
                " 환경\n\t정책  토론 "))
                .isEqualTo("환경 정책 토론");
    }

    @Test
    void createsStableLowercaseSha256Fingerprint() {
        String fingerprint = normalizer.fingerprint("환경 정책");

        assertThat(fingerprint).matches("[0-9a-f]{64}");
        assertThat(normalizer.fingerprint("환경 정책"))
                .isEqualTo(fingerprint);
    }
}
