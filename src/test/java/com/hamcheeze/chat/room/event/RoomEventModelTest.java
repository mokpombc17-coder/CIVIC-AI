package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomEventModelTest {

    private static final String EVENT_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final Instant EMITTED_AT =
            Instant.parse("2026-07-28T10:00:00Z");

    @Test
    void serializesVersionedPublicEnvelopeWithMembershipIdentityOnly()
            throws Exception {
        RoomEventEnvelope event = new RoomEventEnvelope(
                RoomEventEnvelope.CURRENT_VERSION,
                EVENT_ID,
                RoomEventType.ROOM_MEMBER_JOINED,
                EMITTED_AT,
                new RoomMemberChangedEventPayload(
                        "room-1",
                        4,
                        RoomStatus.ACTIVE,
                        member(
                                MembershipRole.MEMBER,
                                MembershipStatus.ACTIVE,
                                0)));

        String json = JsonMapper.builder()
                .build()
                .writeValueAsString(event);

        assertThat(json)
                .contains("\"eventVersion\":2")
                .contains("\"eventId\":\"" + EVENT_ID + "\"")
                .contains("\"eventType\":\"ROOM_MEMBER_JOINED\"")
                .contains("\"emittedAt\":\"2026-07-28T10:00:00Z\"")
                .contains("\"roomId\":\"room-1\"")
                .contains("\"roomVersion\":4")
                .contains("\"membershipId\":\"membership-1\"")
                .contains("\"membershipVersion\":0")
                .doesNotContain("userId")
                .doesNotContain("actorUserId")
                .doesNotContain("targetUserId")
                .doesNotContain("ownerUserId")
                .doesNotContain("clientRequestId")
                .doesNotContain("receiptId")
                .doesNotContain("@class")
                .doesNotContain("@type");
    }

    @Test
    void validatesEnvelopeAndPayloadFields() {
        RoomEventPayload validPayload =
                new RoomMemberChangedEventPayload(
                        "room-1",
                        1,
                        RoomStatus.ACTIVE,
                        member(
                                MembershipRole.MEMBER,
                                MembershipStatus.ACTIVE,
                                0));

        assertThatThrownBy(() -> new RoomEventEnvelope(
                0,
                EVENT_ID,
                RoomEventType.ROOM_MEMBER_JOINED,
                EMITTED_AT,
                validPayload)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomEventEnvelope(
                1,
                "not-a-uuid",
                RoomEventType.ROOM_MEMBER_JOINED,
                EMITTED_AT,
                validPayload)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomEventEnvelope(
                1,
                EVENT_ID,
                null,
                EMITTED_AT,
                validPayload)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new RoomEventEnvelope(
                1,
                EVENT_ID,
                RoomEventType.ROOM_MEMBER_JOINED,
                null,
                validPayload)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new RoomEventEnvelope(
                1,
                EVENT_ID,
                RoomEventType.ROOM_MEMBER_JOINED,
                EMITTED_AT,
                null)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new RoomMemberChangedEventPayload(
                "bad room!",
                1,
                RoomStatus.ACTIVE,
                member(
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        0))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomMemberChangedEventPayload(
                "room-1",
                -1,
                RoomStatus.ACTIVE,
                member(
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        0))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomMemberState(
                " ",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomMemberState(
                "membership-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                -1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsEventTypeAndPayloadSemanticMismatch() {
        assertThatThrownBy(() -> envelope(
                RoomEventType.ROOM_CLOSED,
                new RoomClosedEventPayload(
                        "room-1",
                        4,
                        RoomStatus.ACTIVE,
                        member(
                                MembershipRole.OWNER,
                                MembershipStatus.LEFT,
                                3)))).isInstanceOf(
                IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomCreatedEventPayload(
                "room-1",
                0,
                RoomStatus.ACTIVE,
                member(
                        MembershipRole.OWNER,
                        MembershipStatus.LEFT,
                        0))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> envelope(
                RoomEventType.ROOM_MEMBER_BANNED,
                new RoomMemberChangedEventPayload(
                        "room-1",
                        4,
                        RoomStatus.ACTIVE,
                        member(
                                MembershipRole.MEMBER,
                                MembershipStatus.ACTIVE,
                                3)))).isInstanceOf(
                IllegalArgumentException.class);
    }

    private static RoomEventEnvelope envelope(
            RoomEventType eventType,
            RoomEventPayload payload
    ) {
        return new RoomEventEnvelope(
                RoomEventEnvelope.CURRENT_VERSION,
                EVENT_ID,
                eventType,
                EMITTED_AT,
                payload);
    }

    private static RoomMemberState member(
            MembershipRole role,
            MembershipStatus status,
            long version
    ) {
        return new RoomMemberState(
                "membership-1",
                role,
                status,
                version);
    }
}
