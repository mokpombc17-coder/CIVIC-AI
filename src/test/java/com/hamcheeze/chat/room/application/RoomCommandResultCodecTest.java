package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCodec;
import com.hamcheeze.chat.room.application.result.RoomSettingsSnapshot;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCommandResultCodecTest {

    private final RoomCommandResultCodec codec =
            new RoomCommandResultCodec(
                    JsonMapper.builder().build());

    @Test
    void roundTripsEveryStableResultCodeAndSnapshotField() {
        for (RoomCommandResultCode code
                : RoomCommandResultCode.values()) {
            RoomCommandResult original = result(code);

            StoredRoomCommandResult stored = codec.encode(original);
            RoomCommandResult restored = codec.decode(
                    stored,
                    original.commandType());

            assertThat(stored.resultType())
                    .isEqualTo(RoomCommandResultCodec.RESULT_TYPE);
            assertThat(stored.resultSchemaVersion()).isEqualTo(
                    original.commandType()
                            == RoomCommandType.UPDATE_ROOM_SETTINGS
                            ? RoomCommandResultCodec
                                    .SETTINGS_RESULT_SCHEMA_VERSION
                            : RoomCommandResultCodec
                                    .RESULT_SCHEMA_VERSION);
            assertThat(restored).isEqualTo(original);
        }
    }

    @Test
    void rejectsUnsupportedSchemaMalformedAndUnknownPayload() {
        RoomCommandResult original =
                result(RoomCommandResultCode.JOINED);
        StoredRoomCommandResult stored = codec.encode(original);

        assertThatThrownBy(() -> codec.decode(
                new StoredRoomCommandResult(
                        stored.resultType(),
                        2,
                        stored.payload()),
                RoomCommandType.JOIN_ROOM))
                .isInstanceOf(RoomCommandExecutionException.class);
        assertThatThrownBy(() -> codec.decode(
                new StoredRoomCommandResult(
                        stored.resultType(),
                        1,
                        "{"),
                RoomCommandType.JOIN_ROOM))
                .isInstanceOf(RoomCommandExecutionException.class);
        assertThatThrownBy(() -> codec.decode(
                new StoredRoomCommandResult(
                        stored.resultType(),
                        1,
                        stored.payload().replaceFirst(
                                "\\}$",
                                ",\"unknown\":true}")),
                RoomCommandType.JOIN_ROOM))
                .isInstanceOf(RoomCommandExecutionException.class);
    }

    @Test
    void rejectsReceiptAndPayloadCommandTypeMismatch() {
        StoredRoomCommandResult stored = codec.encode(
                result(RoomCommandResultCode.JOINED));

        assertThatThrownBy(() -> codec.decode(
                stored,
                RoomCommandType.LEAVE_ROOM))
                .isInstanceOf(RoomCommandExecutionException.class)
                .hasMessageContaining("does not match");
    }

    @Test
    void rejectsSuccessCodeThatDoesNotBelongToCommandType() {
        assertThatThrownBy(() -> new RoomCommandResult(
                RoomCommandType.JOIN_ROOM,
                RoomCommandResultCode.ROOM_CREATED,
                "room-1",
                null,
                null,
                "owner-membership",
                "owner-1",
                null,
                null,
                null,
                null,
                null,
                null,
                0L,
                null,
                0L,
                null,
                null))
                .isInstanceOf(IllegalArgumentException.class);

        assertPermanentDecodeFailure(changed(
                codec.encode(result(RoomCommandResultCode.JOINED)),
                "\"code\":\"JOINED\"",
                "\"code\":\"ROOM_CREATED\""));
        assertPermanentDecodeFailure(changed(
                codec.encode(result(RoomCommandResultCode.CLOSED)),
                "\"code\":\"CLOSED\"",
                "\"code\":\"JOINED\""));
    }

    @Test
    void rejectsMissingRequiredSuccessSnapshotFields() {
        assertPermanentDecodeFailure(changed(
                codec.encode(result(
                        RoomCommandResultCode.ROOM_CREATED)),
                "\"ownerMembershipId\":\"owner-membership\"",
                "\"ownerMembershipId\":null"));
        assertPermanentDecodeFailure(changed(
                codec.encode(result(RoomCommandResultCode.JOINED)),
                "\"membershipVersion\":6",
                "\"membershipVersion\":null"));
        assertPermanentDecodeFailure(changed(
                codec.encode(result(
                        RoomCommandResultCode
                                .OWNERSHIP_TRANSFERRED)),
                "\"newOwnerUserId\":\"owner-2\"",
                "\"newOwnerUserId\":null"));
        assertPermanentDecodeFailure(changed(
                codec.encode(result(RoomCommandResultCode.BANNED)),
                "\"targetMembershipId\":\"target-membership-1\"",
                "\"targetMembershipId\":null"));
        assertPermanentDecodeFailure(changed(
                codec.encode(result(RoomCommandResultCode.CLOSED)),
                "\"ownerMembershipVersion\":5",
                "\"ownerMembershipVersion\":null"));
        assertPermanentDecodeFailure(changed(
                codec.encode(result(
                        RoomCommandResultCode
                                .ROOM_SETTINGS_UPDATED)),
                "\"description\":\"Room description\"",
                "\"description\":null"));
    }

    private void assertPermanentDecodeFailure(
            StoredRoomCommandResult stored
    ) {
        assertThatThrownBy(() -> codec.decode(
                stored,
                RoomCommandType.valueOf(
                        payloadCommandType(stored))))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(
                                        RoomCommandFailureKind
                                                .PERMANENT));
    }

    private StoredRoomCommandResult changed(
            StoredRoomCommandResult stored,
            String existing,
            String replacement
    ) {
        return new StoredRoomCommandResult(
                stored.resultType(),
                stored.resultSchemaVersion(),
                stored.payload().replace(existing, replacement));
    }

    private String payloadCommandType(
            StoredRoomCommandResult stored
    ) {
        String marker = "\"commandType\":\"";
        int start = stored.payload().indexOf(marker) + marker.length();
        int end = stored.payload().indexOf('"', start);
        return stored.payload().substring(start, end);
    }

    private RoomCommandResult result(RoomCommandResultCode code) {
        RoomCommandType commandType = switch (code) {
            case ROOM_CREATED -> RoomCommandType.CREATE_ROOM;
            case JOINED, REJOINED, ALREADY_ACTIVE ->
                    RoomCommandType.JOIN_ROOM;
            case LEFT, ALREADY_LEFT ->
                    RoomCommandType.LEAVE_ROOM;
            case OWNERSHIP_TRANSFERRED ->
                    RoomCommandType.TRANSFER_OWNERSHIP;
            case BANNED, ALREADY_BANNED ->
                    RoomCommandType.BAN_MEMBER;
            case UNBANNED, ALREADY_UNBANNED ->
                    RoomCommandType.UNBAN_MEMBER;
            case CLOSED, ALREADY_CLOSED ->
                    RoomCommandType.CLOSE_ROOM;
            case ROOM_SETTINGS_UPDATED,
                    ROOM_SETTINGS_UNCHANGED ->
                    RoomCommandType.UPDATE_ROOM_SETTINGS;
            default -> RoomCommandType.JOIN_ROOM;
        };
        if (commandType == RoomCommandType.UPDATE_ROOM_SETTINGS) {
            return new RoomCommandResult(
                    commandType,
                    code,
                    "room-1",
                    null,
                    null,
                    null,
                    "owner-1",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    7L,
                    null,
                    null,
                    null,
                    null,
                    new RoomSettingsSnapshot(
                            "Room name",
                            "Room description",
                            RoomVisibility.UNLISTED,
                            JoinPolicy.INVITE_ONLY));
        }
        return new RoomCommandResult(
                commandType,
                code,
                "room-1",
                "membership-1",
                "user-1",
                "owner-membership",
                "owner-1",
                "owner-1",
                "owner-2",
                "membership-owner-1",
                "membership-owner-2",
                "target-1",
                "target-membership-1",
                7L,
                6L,
                5L,
                4L,
                3L);
    }
}
