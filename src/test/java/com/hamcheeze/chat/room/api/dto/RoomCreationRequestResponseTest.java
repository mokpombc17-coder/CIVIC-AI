package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.creation.RoomCreationRequestResultCode;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCreationRequestResponseTest {

    private static final Instant REQUESTED_AT =
            Instant.parse("2026-08-25T01:00:00Z");
    private static final Instant RESOLVED_AT =
            Instant.parse("2026-08-25T01:01:00Z");

    @Test
    void pendingResponseUsesUnifiedContractWithNullableRoomFields()
            throws Exception {
        RoomCreationRequestResponse response = pending();

        JsonNode json = JsonMapper.builder()
                .findAndAddModules()
                .build()
                .valueToTree(response);

        assertThat(json.propertyNames()).containsExactlyInAnyOrderElementsOf(
                Set.of(
                        "clientRequestId",
                        "code",
                        "replayed",
                        "creationRequestId",
                        "status",
                        "requestedAt",
                        "resolvedAt",
                        "roomId",
                        "ownerMembershipId",
                        "roomVersion",
                        "ownerMembershipVersion",
                        "rejectionReason"));
        assertThat(json.get("code").asText())
                .isEqualTo("ROOM_CREATION_REQUESTED");
        assertThat(json.get("status").asText()).isEqualTo("PENDING");
        assertThat(json.get("roomId").isNull()).isTrue();
        assertThat(json.get("resolvedAt").isNull()).isTrue();
    }

    @Test
    void supportsApprovedRejectedAndCanceledRepresentations() {
        RoomCreationRequestResponse approved =
                new RoomCreationRequestResponse(
                        "client-1",
                        RoomCreationRequestResultCode.ROOM_CREATED,
                        false,
                        "request-1",
                        RoomCreationRequestStatus.APPROVED,
                        REQUESTED_AT,
                        RESOLVED_AT,
                        "room-1",
                        "membership-1",
                        0L,
                        0L,
                        null);
        RoomCreationRequestResponse rejected =
                new RoomCreationRequestResponse(
                        "client-2",
                        RoomCreationRequestResultCode
                                .ROOM_CREATION_REJECTED,
                        true,
                        "request-2",
                        RoomCreationRequestStatus.REJECTED,
                        REQUESTED_AT,
                        RESOLVED_AT,
                        null,
                        null,
                        null,
                        null,
                        "  생성 목적을 확인할 수 없습니다.  ");
        RoomCreationRequestResponse canceled =
                new RoomCreationRequestResponse(
                        "client-3",
                        RoomCreationRequestResultCode
                                .ROOM_CREATION_CANCELED,
                        false,
                        "request-3",
                        RoomCreationRequestStatus.CANCELED,
                        REQUESTED_AT,
                        RESOLVED_AT,
                        null,
                        null,
                        null,
                        null,
                        null);

        assertThat(approved.roomId()).isEqualTo("room-1");
        assertThat(rejected.rejectionReason())
                .isEqualTo("생성 목적을 확인할 수 없습니다.");
        assertThat(canceled.status())
                .isEqualTo(RoomCreationRequestStatus.CANCELED);
    }

    @Test
    void rejectsMismatchedOrIncompleteRepresentations() {
        assertThatThrownBy(() -> new RoomCreationRequestResponse(
                "client-1",
                RoomCreationRequestResultCode.ROOM_CREATED,
                false,
                "request-1",
                RoomCreationRequestStatus.PENDING,
                REQUESTED_AT,
                null,
                null,
                null,
                null,
                null,
                null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("code does not match status");

        assertThatThrownBy(() -> new RoomCreationRequestResponse(
                "client-1",
                RoomCreationRequestResultCode.ROOM_CREATED,
                false,
                "request-1",
                RoomCreationRequestStatus.APPROVED,
                REQUESTED_AT,
                RESOLVED_AT,
                null,
                null,
                null,
                null,
                null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("roomId must not be blank");
    }

    private static RoomCreationRequestResponse pending() {
        return new RoomCreationRequestResponse(
                "client-1",
                RoomCreationRequestResultCode
                        .ROOM_CREATION_REQUESTED,
                false,
                "request-1",
                RoomCreationRequestStatus.PENDING,
                REQUESTED_AT,
                null,
                null,
                null,
                null,
                null,
                null);
    }
}
