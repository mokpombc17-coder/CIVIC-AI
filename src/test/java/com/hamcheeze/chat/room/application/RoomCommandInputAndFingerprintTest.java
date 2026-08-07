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
import com.hamcheeze.chat.room.application.command.UpdateRoomSettingsCommand;
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
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
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
                "membership-2"))
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
                "membership-2"))
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
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                null,
                JoinPolicy.OPEN))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void targetCommandsRequireMembershipId() {
        assertThatThrownBy(() -> new TransferOwnershipCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BanMemberCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UnbanMemberCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                " ")).isInstanceOf(IllegalArgumentException.class);

        assertThat(new TransferOwnershipCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                "membership-2").targetMembershipId())
                .isEqualTo("membership-2");
        assertThat(new BanMemberCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                "membership-2").targetMembershipId())
                .isEqualTo("membership-2");
        assertThat(new UnbanMemberCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                "membership-2").targetMembershipId())
                .isEqualTo("membership-2");
    }

    @Test
    void canonicalizesAndValidatesRoomName() {
        CreateRoomCommand command = new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "  Test room  ",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        assertThat(command.name()).isEqualTo("Test room");
        assertThatThrownBy(() -> new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                " ",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "a".repeat(101),
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
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
        String transferMembership2 = fingerprints.create(
                new TransferOwnershipCommand(
                        "user-1",
                        REQUEST_ID,
                        "room-1",
                        "membership-2"));
        String transferMembership3 = fingerprints.create(
                new TransferOwnershipCommand(
                        "user-1",
                        REQUEST_ID,
                        "room-1",
                        "membership-3"));
        String listed = fingerprints.create(new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN));
        String unlisted = fingerprints.create(new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.UNLISTED,
                JoinPolicy.INVITE_ONLY));
        String anotherName = fingerprints.create(
                new CreateRoomCommand(
                        "user-1",
                        REQUEST_ID,
                        "Another room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));
        String anotherCategory = fingerprints.create(
                new CreateRoomCommand(
                        "user-1",
                        REQUEST_ID,
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory
                                        .ENVIRONMENT),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));

        assertThat(List.of(
                join,
                leave,
                anotherRoom,
                transferMembership2,
                transferMembership3,
                listed,
                unlisted,
                anotherName,
                anotherCategory)).doesNotHaveDuplicates();
    }

    @Test
    void createFingerprintKeepsEmptyDescriptionContract() {
        CreateRoomCommand legacy = new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        CreateRoomCommand explicitEmpty = new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                "",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        CreateRoomCommand described = new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Test room",
                "Description",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        assertThat(fingerprints.create(legacy))
                .isEqualTo(
                        "sha256:099589aa653a52f740749bae420fb5bf"
                                + "03ac07055b0d3cf92978d127cdaf6ab1")
                .isEqualTo(fingerprints.create(explicitEmpty))
                .isNotEqualTo(fingerprints.create(described));
    }

    @Test
    void settingsFingerprintUsesCanonicalValuesAndFieldPresence() {
        UpdateRoomSettingsCommand padded =
                update(true, "  New room  ", false, null);
        UpdateRoomSettingsCommand canonical =
                update(true, "New room", false, null);
        UpdateRoomSettingsCommand removeDescription =
                update(false, null, true, "");
        UpdateRoomSettingsCommand nameAndDescription =
                new UpdateRoomSettingsCommand(
                        "user-1",
                        REQUEST_ID,
                        "room-1",
                        true,
                        "New room",
                        true,
                        "",
                        false,
                        null,
                        false,
                        null);
        UpdateRoomSettingsCommand policy = categoryUpdate(
                com.hamcheeze.chat.room.RoomCategory.POLICY);
        UpdateRoomSettingsCommand environment = categoryUpdate(
                com.hamcheeze.chat.room.RoomCategory.ENVIRONMENT);

        assertThat(fingerprints.create(padded))
                .isEqualTo(fingerprints.create(canonical));
        assertThat(List.of(
                fingerprints.create(canonical),
                fingerprints.create(removeDescription),
                fingerprints.create(nameAndDescription),
                fingerprints.create(policy),
                fingerprints.create(environment)))
                .doesNotHaveDuplicates();
    }

    @Test
    void settingsCommandRejectsEmptyPatchAndInvalidPresence() {
        assertThatThrownBy(() -> update(
                false,
                null,
                false,
                null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> update(
                true,
                null,
                false,
                null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> update(
                false,
                "unexpected",
                true,
                "")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UpdateRoomSettingsCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                false,
                null,
                false,
                null,
                true,
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY,
                        com.hamcheeze.chat.room.RoomCategory.ENVIRONMENT),
                false,
                null,
                false,
                null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void commandsRejectEveryForbiddenC0BeforeStripping() {
        for (int codePoint = 0; codePoint <= 0x1f; codePoint++) {
            if (allowedDescriptionControl(codePoint)) {
                continue;
            }
            String control = Character.toString(codePoint);
            for (String description : new String[]{
                    control + "description",
                    "description" + control,
                    "description" + control + "text"}) {
                assertThatThrownBy(() ->
                        new CreateRoomCommand(
                                "user-1",
                                REQUEST_ID,
                                "Room",
                                description,
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                                RoomVisibility.LISTED,
                                JoinPolicy.OPEN))
                        .as(
                                "CreateRoomCommand U+%04X",
                                codePoint)
                        .isInstanceOf(IllegalArgumentException.class);
                assertThatThrownBy(() ->
                        update(
                                false,
                                null,
                                true,
                                description))
                        .as(
                                "UpdateRoomSettingsCommand U+%04X",
                                codePoint)
                        .isInstanceOf(IllegalArgumentException.class);
            }
        }
    }

    @Test
    void commandsKeepAllowedControlsAndCanonicalizeBoundaries() {
        for (String description : new String[]{
                "line1\tline2",
                "line1\nline2",
                "line1\rline2"}) {
            assertThat(new CreateRoomCommand(
                    "user-1",
                    REQUEST_ID,
                    "Room",
                    description,
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                    RoomVisibility.LISTED,
                    JoinPolicy.OPEN).description())
                    .isEqualTo(description);
            assertThat(update(
                    false,
                    null,
                    true,
                    description).description())
                    .isEqualTo(description);
        }
        assertThat(new CreateRoomCommand(
                "user-1",
                REQUEST_ID,
                "Room",
                "\tdescription\n",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN).description())
                .isEqualTo("description");
    }

    private List<RoomCommand> commands(String requestId) {
        return List.of(
                new CreateRoomCommand(
                        "user-1",
                        requestId,
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
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
                        "membership-2"),
                new BanMemberCommand(
                        "user-1",
                        requestId,
                        "room-1",
                        "membership-2"),
                new UnbanMemberCommand(
                        "user-1",
                        requestId,
                        "room-1",
                        "membership-2"),
                new CloseRoomCommand(
                        "user-1",
                        requestId,
                        "room-1"),
                new UpdateRoomSettingsCommand(
                        "user-1",
                        requestId,
                        "room-1",
                        true,
                        "New room",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null));
    }

    private UpdateRoomSettingsCommand update(
            boolean namePresent,
            String name,
            boolean descriptionPresent,
            String description
    ) {
        return new UpdateRoomSettingsCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                namePresent,
                name,
                descriptionPresent,
                description,
                false,
                null,
                false,
                null);
    }

    private UpdateRoomSettingsCommand categoryUpdate(
            com.hamcheeze.chat.room.RoomCategory category
    ) {
        return new UpdateRoomSettingsCommand(
                "user-1",
                REQUEST_ID,
                "room-1",
                false,
                null,
                false,
                null,
                true,
                java.util.List.of(category),
                false,
                null,
                false,
                null);
    }

    private boolean allowedDescriptionControl(int codePoint) {
        return codePoint == '\t'
                || codePoint == '\n'
                || codePoint == '\r';
    }
}
