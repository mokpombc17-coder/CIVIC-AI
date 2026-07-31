package com.hamcheeze.chat.message.outbox;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Instant;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClaimedChatMessageOutboxEventTest {

    private static final Instant NOW =
            Instant.parse("2026-07-31T00:00:00Z");

    @Test
    void decodesValidMessageCreatedEvent() {
        ClaimedChatMessageOutboxEvent claimed = event(
                "chat-message-created:message-1",
                "message-1",
                "room-1",
                1L,
                payload(
                        "message-1",
                        "room-1",
                        1L,
                        "user-1",
                        "client-1",
                        "hello"));

        var envelope = claimed.decodeEnvelope();

        assertThat(envelope.eventVersion()).isEqualTo(1);
        assertThat(envelope.eventType())
                .isEqualTo("CHAT_MESSAGE_CREATED");
        assertThat(envelope.payload().messageId())
                .isEqualTo("message-1");
        assertThat(envelope.payload().roomSequence())
                .isEqualTo(1L);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("malformedEvents")
    void rejectsMalformedSupportedEvent(
            String scenario,
            ClaimedChatMessageOutboxEvent claimed
    ) {
        assertThatThrownBy(claimed::decodeEnvelope)
                .as(scenario)
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static Stream<Arguments> malformedEvents() {
        return Stream.of(
                Arguments.of(
                        "eventId aggregate mismatch",
                        event(
                                "chat-message-created:message-2",
                                "message-1",
                                "room-1",
                                1L,
                                validPayload())),
                Arguments.of(
                        "eventId prefix mismatch",
                        event(
                                "message-created:message-1",
                                "message-1",
                                "room-1",
                                1L,
                                validPayload())),
                Arguments.of(
                        "blank eventId",
                        event(
                                " ",
                                "message-1",
                                "room-1",
                                1L,
                                validPayload())),
                Arguments.of(
                        "zero metadata sequence",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                0L,
                                validPayload())),
                Arguments.of(
                        "negative metadata sequence",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                -1L,
                                validPayload())),
                Arguments.of(
                        "zero payload sequence",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        "room-1",
                                        0L,
                                        "user-1",
                                        "client-1",
                                        "hello"))),
                Arguments.of(
                        "negative payload sequence",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        "room-1",
                                        -1L,
                                        "user-1",
                                        "client-1",
                                        "hello"))),
                Arguments.of(
                        "metadata payload sequence mismatch",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        "room-1",
                                        2L,
                                        "user-1",
                                        "client-1",
                                        "hello"))),
                Arguments.of(
                        "blank aggregateId",
                        event(
                                validEventId(),
                                " ",
                                "room-1",
                                1L,
                                validPayload())),
                Arguments.of(
                        "blank metadata roomId",
                        event(
                                validEventId(),
                                "message-1",
                                " ",
                                1L,
                                validPayload())),
                Arguments.of(
                        "blank payload messageId",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        " ",
                                        "room-1",
                                        1L,
                                        "user-1",
                                        "client-1",
                                        "hello"))),
                Arguments.of(
                        "blank payload roomId",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        " ",
                                        1L,
                                        "user-1",
                                        "client-1",
                                        "hello"))),
                Arguments.of(
                        "blank senderUserId",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        "room-1",
                                        1L,
                                        " ",
                                        "client-1",
                                        "hello"))),
                Arguments.of(
                        "blank clientMessageId",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        "room-1",
                                        1L,
                                        "user-1",
                                        " ",
                                        "hello"))),
                Arguments.of(
                        "blank content",
                        event(
                                validEventId(),
                                "message-1",
                                "room-1",
                                1L,
                                payload(
                                        "message-1",
                                        "room-1",
                                        1L,
                                        "user-1",
                                        "client-1",
                                        " "))));
    }

    private static String validEventId() {
        return ChatMessageOutboxEvent.messageCreatedEventId(
                "message-1");
    }

    private static ClaimedChatMessageOutboxEvent.Payload
    validPayload() {
        return payload(
                "message-1",
                "room-1",
                1L,
                "user-1",
                "client-1",
                "hello");
    }

    private static ClaimedChatMessageOutboxEvent event(
            String eventId,
            String aggregateId,
            String roomId,
            Long roomSequence,
            ClaimedChatMessageOutboxEvent.Payload payload
    ) {
        return new ClaimedChatMessageOutboxEvent(
                eventId,
                1L,
                1,
                "CHAT_MESSAGE",
                aggregateId,
                1,
                "CHAT_MESSAGE_CREATED",
                roomId,
                roomSequence,
                payload,
                NOW);
    }

    private static ClaimedChatMessageOutboxEvent.Payload payload(
            String messageId,
            String roomId,
            Long roomSequence,
            String senderUserId,
            String clientMessageId,
            String content
    ) {
        return new ClaimedChatMessageOutboxEvent.Payload(
                messageId,
                roomId,
                roomSequence,
                senderUserId,
                clientMessageId,
                content,
                NOW);
    }
}
