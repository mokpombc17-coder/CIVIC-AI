package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record RoomEventEnvelope(
        int eventVersion,
        String eventId,
        RoomEventType eventType,
        Instant emittedAt,
        RoomEventPayload payload
) {

    public static final int CURRENT_VERSION = 1;

    public RoomEventEnvelope {
        if (eventVersion < 1) {
            throw new IllegalArgumentException(
                    "eventVersion must be positive");
        }
        eventId = canonicalEventId(eventId);
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(emittedAt, "emittedAt");
        Objects.requireNonNull(payload, "payload");
        validatePayload(eventType, payload);
    }

    private static String canonicalEventId(String eventId) {
        if (eventId == null || eventId.isBlank()) {
            throw new IllegalArgumentException(
                    "eventId must be a UUID");
        }
        try {
            String canonical = UUID.fromString(eventId).toString();
            if (!canonical.equalsIgnoreCase(eventId)) {
                throw new IllegalArgumentException(
                        "eventId must be a UUID");
            }
            return canonical;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "eventId must be a UUID",
                    exception);
        }
    }

    private static void validatePayload(
            RoomEventType eventType,
            RoomEventPayload payload
    ) {
        switch (eventType) {
            case ROOM_CREATED -> requirePayload(
                    payload,
                    RoomCreatedEventPayload.class);
            case ROOM_MEMBER_JOINED, ROOM_MEMBER_REJOINED ->
                    requireMemberPayload(
                            payload,
                            MembershipStatus.ACTIVE);
            case ROOM_MEMBER_LEFT, ROOM_MEMBER_UNBANNED ->
                    requireMemberPayload(
                            payload,
                            MembershipStatus.LEFT);
            case ROOM_MEMBER_BANNED -> requireMemberPayload(
                    payload,
                    MembershipStatus.BANNED);
            case ROOM_OWNERSHIP_TRANSFERRED -> requirePayload(
                    payload,
                    RoomOwnershipTransferredEventPayload.class);
            case ROOM_CLOSED -> requirePayload(
                    payload,
                    RoomClosedEventPayload.class);
        }
    }

    private static void requireMemberPayload(
            RoomEventPayload payload,
            MembershipStatus expectedStatus
    ) {
        requirePayload(
                payload,
                RoomMemberChangedEventPayload.class);
        RoomMemberChangedEventPayload changed =
                (RoomMemberChangedEventPayload) payload;
        if (changed.roomStatus() != RoomStatus.ACTIVE
                || changed.member().role() != MembershipRole.MEMBER
                || changed.member().status() != expectedStatus) {
            throw new IllegalArgumentException(
                    "Invalid Room member event state");
        }
    }

    private static void requirePayload(
            RoomEventPayload payload,
            Class<? extends RoomEventPayload> expectedType
    ) {
        if (!expectedType.isInstance(payload)) {
            throw new IllegalArgumentException(
                    "Event type and payload do not match");
        }
    }
}
