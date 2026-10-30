package com.hamcheeze.chat.application;

import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatCommandValidatorTest {

    private static final String CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440000";

    private ChatCommandValidator validator;

    @BeforeEach
    void setUp() {
        validator = new ChatCommandValidator(new ChatContentProperties());
    }

    @Test
    void validatesAndNormalizesContentOnce() {
        ValidatedChatContent content =
                validator.validateContent(
                        "  hello 😀  ", CLIENT_MESSAGE_ID);

        assertThat(content.normalizedContent()).isEqualTo("hello 😀");
        assertThat(content.codePointCount()).isEqualTo(7);
        assertThat(content.utf8ByteCount()).isEqualTo(10);
    }

    @Test
    void acceptsCanonicalUuidAndCanonicalizesUppercaseUuid() {
        assertThat(validator.validateClientMessageId(CLIENT_MESSAGE_ID))
                .isEqualTo(CLIENT_MESSAGE_ID);
        assertThat(validator.validateClientMutationId(
                "550E8400-E29B-41D4-A716-446655440000"))
                .isEqualTo(CLIENT_MESSAGE_ID);
        assertThat(validator.validateClientMessageId(
                "550E8400-E29B-41D4-A716-446655440000"))
                .isEqualTo(CLIENT_MESSAGE_ID);
    }

    @Test
    void validatesOpaqueMessageIdWithoutAddingUuidConstraint() {
        assertThat(validator.validateMessageId(
                "server-message_01",
                CLIENT_MESSAGE_ID))
                .isEqualTo("server-message_01");
        assertThatThrownBy(() -> validator.validateMessageId(
                " server-message_01 ",
                CLIENT_MESSAGE_ID))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(ChatCommandRejectedCode.INVALID_MESSAGE_ID);
    }

    @Test
    void rejectsInvalidMutationUuidSeparately() {
        assertThatThrownBy(() ->
                validator.validateClientMutationId("mutation-1"))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(
                        ChatCommandRejectedCode
                                .INVALID_CLIENT_MUTATION_ID);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            " 550e8400-e29b-41d4-a716-446655440000",
            "550e8400-e29b-41d4-a716-446655440000 ",
            "client-message-1",
            "550e8400e29b41d4a716446655440000",
            "550e8400-e29b-41d4-a716",
            "550e8400-e29b-41d4-a716-4466554400000",
            "550e8400-e29b-41d4-a716-44665544000g"
    })
    void rejectsInvalidClientMessageIds(String value) {
        assertThatThrownBy(() -> validator.validateClientMessageId(value))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(
                        ChatCommandRejectedCode.INVALID_CLIENT_MESSAGE_ID);
    }

    @Test
    void rejectsMissingClientMessageIdWithNullResponseId() {
        assertInvalidClientMessageId(null);
    }

    @Test
    void rejectsForbiddenC0BeforeStripButAllowsTabLfCr() {
        assertThatThrownBy(() ->
                validator.validateContent(
                        " hello\u0001 ", CLIENT_MESSAGE_ID))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(
                        ChatCommandRejectedCode.INVALID_CONTROL_CHARACTER);

        assertThat(validator.validateContent(
                "\t hello\r\n", CLIENT_MESSAGE_ID).normalizedContent())
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
                "😀".repeat(2_100), CLIENT_MESSAGE_ID))
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
                validator.validateContent(content, CLIENT_MESSAGE_ID))
                .isInstanceOf(ChatValidationException.class)
                .extracting(exception ->
                        ((ChatValidationException) exception).code())
                .isEqualTo(code);
    }
}
