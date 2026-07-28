package com.hamcheeze.chat.room.application.result;

import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.ObjectWriter;

public final class RoomCommandResultCodec {

    public static final String RESULT_TYPE = "ROOM_COMMAND_RESULT";
    public static final int RESULT_SCHEMA_VERSION = 1;

    private final ObjectWriter writer;
    private final ObjectReader reader;

    public RoomCommandResultCodec(ObjectMapper objectMapper) {
        this.writer = objectMapper.writerFor(ResultPayload.class);
        this.reader = objectMapper.readerFor(ResultPayload.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public StoredRoomCommandResult encode(RoomCommandResult result) {
        try {
            return new StoredRoomCommandResult(
                    RESULT_TYPE,
                    RESULT_SCHEMA_VERSION,
                    writer.writeValueAsString(
                            ResultPayload.from(result)));
        } catch (RuntimeException exception) {
            throw codecFailure(
                    "Failed to encode room command result",
                    exception);
        }
    }

    public RoomCommandResult decode(
            StoredRoomCommandResult stored,
            RoomCommandType expectedCommandType
    ) {
        if (!RESULT_TYPE.equals(stored.resultType())) {
            throw codecFailure(
                    "Unsupported room command result type: "
                            + stored.resultType(),
                    null);
        }
        if (stored.resultSchemaVersion() != RESULT_SCHEMA_VERSION) {
            throw codecFailure(
                    "Unsupported room command result schema version: "
                            + stored.resultSchemaVersion(),
                    null);
        }
        try {
            ResultPayload payload =
                    reader.readValue(stored.payload());
            RoomCommandResult result = payload.toResult();
            if (result.commandType() != expectedCommandType) {
                throw codecFailure(
                        "Receipt command type does not match result: "
                                + expectedCommandType
                                + " != "
                                + result.commandType(),
                        null);
            }
            return result;
        } catch (RoomCommandExecutionException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw codecFailure(
                    "Failed to decode room command result",
                    exception);
        }
    }

    private static RoomCommandExecutionException codecFailure(
            String message,
            Throwable cause
    ) {
        return new RoomCommandExecutionException(
                RoomCommandFailureKind.PERMANENT,
                message,
                cause);
    }

    private record ResultPayload(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String roomId,
            String membershipId,
            String membershipUserId,
            String ownerMembershipId,
            String ownerUserId,
            String previousOwnerUserId,
            String newOwnerUserId,
            String previousOwnerMembershipId,
            String newOwnerMembershipId,
            String targetUserId,
            String targetMembershipId,
            Long roomVersion,
            Long membershipVersion,
            Long ownerMembershipVersion,
            Long previousOwnerMembershipVersion,
            Long newOwnerMembershipVersion
    ) {

        private static ResultPayload from(RoomCommandResult result) {
            return new ResultPayload(
                    result.commandType(),
                    result.code(),
                    result.roomId(),
                    result.membershipId(),
                    result.membershipUserId(),
                    result.ownerMembershipId(),
                    result.ownerUserId(),
                    result.previousOwnerUserId(),
                    result.newOwnerUserId(),
                    result.previousOwnerMembershipId(),
                    result.newOwnerMembershipId(),
                    result.targetUserId(),
                    result.targetMembershipId(),
                    result.roomVersion(),
                    result.membershipVersion(),
                    result.ownerMembershipVersion(),
                    result.previousOwnerMembershipVersion(),
                    result.newOwnerMembershipVersion());
        }

        private RoomCommandResult toResult() {
            return new RoomCommandResult(
                    commandType,
                    code,
                    roomId,
                    membershipId,
                    membershipUserId,
                    ownerMembershipId,
                    ownerUserId,
                    previousOwnerUserId,
                    newOwnerUserId,
                    previousOwnerMembershipId,
                    newOwnerMembershipId,
                    targetUserId,
                    targetMembershipId,
                    roomVersion,
                    membershipVersion,
                    ownerMembershipVersion,
                    previousOwnerMembershipVersion,
                    newOwnerMembershipVersion);
        }
    }
}
