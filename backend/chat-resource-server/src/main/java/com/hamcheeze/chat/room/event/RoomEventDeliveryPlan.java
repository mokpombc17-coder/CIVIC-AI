package com.hamcheeze.chat.room.event;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public record RoomEventDeliveryPlan(
        RoomEventEnvelope event,
        Set<String> userRecipients
) {

    public RoomEventDeliveryPlan {
        Objects.requireNonNull(event, "event");
        Objects.requireNonNull(userRecipients, "userRecipients");
        Set<String> recipients = new HashSet<>();
        for (String recipient : userRecipients) {
            recipients.add(RoomEventValidation.requireText(
                    recipient,
                    "userRecipient"));
        }
        userRecipients = Set.copyOf(recipients);
    }
}
