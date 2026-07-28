package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCodec;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
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
            assertThat(stored.resultSchemaVersion())
                    .isEqualTo(
                            RoomCommandResultCodec.RESULT_SCHEMA_VERSION);
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
            default -> RoomCommandType.JOIN_ROOM;
        };
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
