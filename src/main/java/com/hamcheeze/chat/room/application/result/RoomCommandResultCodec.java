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
    public static final int SETTINGS_RESULT_SCHEMA_VERSION = 3;

    private final ObjectWriter legacyWriter;
    private final ObjectReader legacyReader;
    private final ObjectWriter settingsWriter;
    private final ObjectReader settingsReader;

    public RoomCommandResultCodec(ObjectMapper objectMapper) {
        this.legacyWriter =
                objectMapper.writerFor(LegacyResultPayload.class);
        this.legacyReader =
                objectMapper.readerFor(LegacyResultPayload.class)
                        .with(DeserializationFeature
                                .FAIL_ON_UNKNOWN_PROPERTIES);
        this.settingsWriter =
                objectMapper.writerFor(SettingsResultPayload.class);
        this.settingsReader =
                objectMapper.readerFor(SettingsResultPayload.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public StoredRoomCommandResult encode(RoomCommandResult result) {
        try {
            if (result.commandType()
                    == RoomCommandType.UPDATE_ROOM_SETTINGS) {
                return new StoredRoomCommandResult(
                        RESULT_TYPE,
                        SETTINGS_RESULT_SCHEMA_VERSION,
                        settingsWriter.writeValueAsString(
                                SettingsResultPayload.from(result)));
            }
            return new StoredRoomCommandResult(
                    RESULT_TYPE,
                    RESULT_SCHEMA_VERSION,
                    legacyWriter.writeValueAsString(
                            LegacyResultPayload.from(result)));
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
        try {
            RoomCommandResult result = switch (
                    stored.resultSchemaVersion()) {
                case RESULT_SCHEMA_VERSION ->
                        legacyReader
                                .<LegacyResultPayload>readValue(
                                        stored.payload())
                                .toResult();
                case SETTINGS_RESULT_SCHEMA_VERSION ->
                        settingsReader
                                .<SettingsResultPayload>readValue(
                                        stored.payload())
                                .toResult();
                default -> throw codecFailure(
                        "Unsupported room command result schema version: "
                                + stored.resultSchemaVersion(),
                        null);
            };
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

    private record LegacyResultPayload(
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

        private static LegacyResultPayload from(
                RoomCommandResult result
        ) {
            return new LegacyResultPayload(
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

    private record SettingsResultPayload(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String roomId,
            String ownerUserId,
            Long roomVersion,
            RoomSettingsSnapshot roomSettings
    ) {

        private static SettingsResultPayload from(
                RoomCommandResult result
        ) {
            return new SettingsResultPayload(
                    result.commandType(),
                    result.code(),
                    result.roomId(),
                    result.ownerUserId(),
                    result.roomVersion(),
                    result.roomSettings());
        }

        private RoomCommandResult toResult() {
            return new RoomCommandResult(
                    commandType,
                    code,
                    roomId,
                    null,
                    null,
                    null,
                    ownerUserId,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    roomVersion,
                    null,
                    null,
                    null,
                    null,
                    roomSettings);
        }
    }
}
