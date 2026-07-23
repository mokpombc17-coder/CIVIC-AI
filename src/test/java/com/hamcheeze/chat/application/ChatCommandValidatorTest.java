package com.hamcheeze.chat.application;

import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatCommandValidatorTest {

    private ChatCommandValidator validator;

    @BeforeEach
    void setUp() {
        validator = new ChatCommandValidator(new ChatContentProperties());
    }

    @Test
    void validatesAndNormalizesContentOnce() {
        ValidatedChatContent content =
                validator.validateContent("  hello 😀  ", "client-1");

        assertThat(content.normalizedContent()).isEqualTo("hello 😀");
        assertThat(content.codePointCount()).isEqualTo(7);
        assertThat(content.utf8ByteCount()).isEqualTo(10);
    }

    @ParameterizedTest
    @ValueSource(strings = {"bad id", "한글", "id/segment", "id\u0001"})
    void rejectsInvalidClientMessageIds(String value) {
        assertThatThrownBy(() -> validator.validateClientMessageId(value))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(
                        ChatCommandRejectedCode.INVALID_CLIENT_MESSAGE_ID);
    }

    @Test
    void rejectsMissingAndTooLongClientMessageIdsWithNullResponseId() {
        assertInvalidClientMessageId(null);
        assertInvalidClientMessageId("a".repeat(129));
    }

    @Test
    void rejectsForbiddenC0BeforeStripButAllowsTabLfCr() {
        assertThatThrownBy(() ->
                validator.validateContent(" hello\u0001 ", "client-1"))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(
                        ChatCommandRejectedCode.INVALID_CONTROL_CHARACTER);

        assertThat(validator.validateContent(
                "\t hello\r\n", "client-1").normalizedContent())
                .isEqualTo("hello");
    }

    @Test
    void rejectsBlankAndContentLimits() {
        assertRejected(" \t\r\n ", ChatCommandRejectedCode.EMPTY_MESSAGE);
        assertRejected(
                "a".repeat(2_001),
                ChatCommandRejectedCode.MESSAGE_TOO_LONG);

        ChatContentProperties byteLimitProperties =
                new ChatContentProperties();
        byteLimitProperties.setMaxContentCodePoints(3_000);
        ChatCommandValidator byteLimitValidator =
                new ChatCommandValidator(byteLimitProperties);
        assertThatThrownBy(() -> byteLimitValidator.validateContent(
                "😀".repeat(2_100), "client-1"))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(ChatCommandRejectedCode.MESSAGE_TOO_LARGE);
    }

    private void assertInvalidClientMessageId(String value) {
        assertThatThrownBy(() -> validator.validateClientMessageId(value))
                .isInstanceOf(ChatValidationException.class)
                .satisfies(exception -> assertThat(
                        ((ChatValidationException) exception)
                                .responseClientMessageId())
                        .isNull());
    }

    private void assertRejected(
            String content,
            ChatCommandRejectedCode code
    ) {
        assertThatThrownBy(() ->
                validator.validateContent(content, "client-1"))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(code);
    }
}
