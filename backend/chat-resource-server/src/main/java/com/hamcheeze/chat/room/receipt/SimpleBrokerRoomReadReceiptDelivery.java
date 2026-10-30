package com.hamcheeze.chat.room.receipt;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Objects;

public final class SimpleBrokerRoomReadReceiptDelivery
        implements RoomReadReceiptDeliveryPort {

    private static final Logger log = LoggerFactory.getLogger(
            SimpleBrokerRoomReadReceiptDelivery.class);

    private final SimpMessagingTemplate messagingTemplate;

    public SimpleBrokerRoomReadReceiptDelivery(
            SimpMessagingTemplate messagingTemplate
    ) {
        this.messagingTemplate = Objects.requireNonNull(
                messagingTemplate, "messagingTemplate");
    }

    @Override
    public RoomReadReceiptDeliveryOutcome publish(
            RoomReadReceiptEventEnvelope event
    ) {
        Objects.requireNonNull(event, "event");
        try {
            messagingTemplate.convertAndSend(
                    "/topic/rooms/"
                            + event.payload().roomId()
                            + "/read-receipts",
                    event);
            return RoomReadReceiptDeliveryOutcome.ACCEPTED;
        } catch (RuntimeException exception) {
            try {
                log.warn(
                        "Read Receipt event delivery failed: eventId={}, "
                                + "eventType={}, roomId={}, exceptionClass={}",
                        event.eventId(),
                        event.eventType(),
                        event.payload().roomId(),
                        exception.getClass().getName());
            } catch (RuntimeException ignored) {
                // Observability must not affect cursor persistence.
            }
            return RoomReadReceiptDeliveryOutcome.FAILED;
        }
    }
}
