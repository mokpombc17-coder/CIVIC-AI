package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.RoomCommand;
import com.hamcheeze.chat.room.application.command.TransferOwnershipCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.idempotency.RoomCommandFingerprintFactory;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCommandInputAndFingerprintTest {

    private static final String REQUEST_ID =
            "550E8400-E29B-41D4-A716-446655440000";
    private static final String CANONICAL_REQUEST_ID =
            "550e8400-e29b-41d4-a716-446655440000";

    private final RoomCommandFingerprintFactory fingerprints =
            new RoomCommandFingerprintFactory();

    @Test
    void canonicalizesClientRequestIdForEveryCommand() {
        for (RoomCommand command : commands(REQUEST_ID)) {
            assertThat(command.clientRequestId())
                    .isEqualTo(CANONICAL_REQUEST_ID);
        }
    }

    @Test
    void rejectsInvalidCommonInputsForEveryCommand() {
        assertThatThrownBy(() -> new CreateRoomCommand(
                " ",
                REQUEST_ID,
                "Test room",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new JoinRoomCommand(
                "user-1",
                "not-a-uuid",
                "room-1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new LeaveRoomCommand(
                "user-1",
                null,
                "room-1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TransferOwnershipCommand(
                "user-1",
                REQUEST_ID,
                " ",
                "user-2"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BanMemberCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UnbanMemberCommand(
                null,
                REQUEST_ID,
                "room-1",
                "user-2"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CloseRoomCommand(
                "user-1",
                REQUEST_ID,
                null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                null,
                JoinPolicy.OPEN))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void canonicalizesAndValidatesRoomName() {
        CreateRoomCommand command = new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "  Test room  ",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        assertThat(command.name()).isEqualTo("Test room");
        assertThatThrownBy(() -> new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                " ",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "a".repeat(101),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sameTypedCommandAlwaysProducesSameFingerprint() {
        JoinRoomCommand command = new JoinRoomCommand(
                "user-1",
                REQUEST_ID,
                "room-1");

        assertThat(fingerprints.create(command))
                .isEqualTo(fingerprints.create(command))
                .startsWith("sha256:")
                .hasSize(71);
    }

    @Test
    void commandTypeAndPayloadChangesProduceDifferentFingerprints() {
        String join = fingerprints.create(new JoinRoomCommand(
                "user-1",
                REQUEST_ID,
                "room-1"));
        String leave = fingerprints.create(new LeaveRoomCommand(
                "user-1",
                REQUEST_ID,
                "room-1"));
        String anotherRoom = fingerprints.create(new JoinRoomCommand(
                "user-1",
                REQUEST_ID,
                "room-2"));
        String transferUser2 = fingerprints.create(
                new TransferOwnershipCommand(
                        "user-1",
                        REQUEST_ID,
                        "room-1",
                        "user-2"));
        String transferUser3 = fingerprints.create(
                new TransferOwnershipCommand(
                        "user-1",
                        REQUEST_ID,
                        "room-1",
                        "user-3"));
        String listed = fingerprints.create(new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN));
        String unlisted = fingerprints.create(new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                RoomVisibility.UNLISTED,
                JoinPolicy.INVITE_ONLY));
        String anotherName = fingerprints.create(
                new CreateRoomCommand(
                        "user-1",
                        REQUEST_ID,
                        "Another room",
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));

        assertThat(List.of(
                join,
                leave,
                anotherRoom,
                transferUser2,
                transferUser3,
                listed,
                unlisted,
                anotherName)).doesNotHaveDuplicates();
    }

    private List<RoomCommand> commands(String requestId) {
        return List.of(
                new CreateRoomCommand(
                        "user-1",
                        requestId,
                        "Test room",
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN),
                new JoinRoomCommand(
                        "user-1",
                        requestId,
                        "room-1"),
                new LeaveRoomCommand(
                        "user-1",
                        requestId,
                        "room-1"),
                new TransferOwnershipCommand(
                        "user-1",
                        requestId,
                        "room-1",
                        "user-2"),
                new BanMemberCommand(
                        "user-1",
                        requestId,
                        "room-1",
                        "user-2"),
                new UnbanMemberCommand(
                        "user-1",
                        requestId,
                        "room-1",
                        "user-2"),
                new CloseRoomCommand(
                        "user-1",
                        requestId,
                        "room-1"));
    }
}
