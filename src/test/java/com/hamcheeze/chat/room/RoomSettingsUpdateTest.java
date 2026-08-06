package com.hamcheeze.chat.room;

import com.hamcheeze.chat.room.application.result.RoomSettingsSnapshot;
import com.hamcheeze.chat.room.event.RoomSettingsUpdatedEventPayload;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomSettingsUpdateTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-31T00:00:00Z");

    @Test
    void createsWithCanonicalDescriptionAndDefaultsToEmpty() {
        Room withDescription = room(
                "  첫 줄\n둘째 줄  ",
                RoomStatus.ACTIVE,
                7);
        Room withoutDescription = Room.restore(
                "room-2",
                "Room",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                CREATED_AT,
                null,
                0);

        assertThat(withDescription.description())
                .isEqualTo("첫 줄\n둘째 줄");
        assertThat(withoutDescription.description()).isEmpty();
    }

    @Test
    void updatesMultipleSettingsWithOneVersionIncrement() {
        Room original = room("", RoomStatus.ACTIVE, 7);

        RoomSettingsUpdateTransition transition =
                original.updateSettings(
                        "  New room  ",
                        "  New description  ",
                        RoomVisibility.UNLISTED,
                        JoinPolicy.INVITE_ONLY);

        assertThat(transition.outcome())
                .isEqualTo(RoomSettingsUpdateOutcome.UPDATED);
        assertThat(transition.room().name()).isEqualTo("New room");
        assertThat(transition.room().description())
                .isEqualTo("New description");
        assertThat(transition.room().visibility())
                .isEqualTo(RoomVisibility.UNLISTED);
        assertThat(transition.room().joinPolicy())
                .isEqualTo(JoinPolicy.INVITE_ONLY);
        assertThat(transition.room().version()).isEqualTo(8);
        assertThat(transition.room().roomId())
                .isEqualTo(original.roomId());
        assertThat(transition.room().ownerUserId())
                .isEqualTo(original.ownerUserId());
        assertThat(transition.room().createdAt())
                .isEqualTo(original.createdAt());
        assertThat(transition.room().activeMemberCount())
                .isEqualTo(original.activeMemberCount());
    }

    @Test
    void categoryReplacementIncrementsVersionAndSameValueIsUnchanged() {
        Room original = room("", RoomStatus.ACTIVE, 7);

        RoomSettingsUpdateTransition updated = original.updateSettings(
                original.name(),
                original.description(),
                java.util.List.of(RoomCategory.ENVIRONMENT),
                original.visibility(),
                original.joinPolicy());

        assertThat(updated.outcome())
                .isEqualTo(RoomSettingsUpdateOutcome.UPDATED);
        assertThat(updated.room().categories())
                .containsExactly(RoomCategory.ENVIRONMENT);
        assertThat(updated.room().version()).isEqualTo(8);

        RoomSettingsUpdateTransition unchanged =
                updated.room().updateSettings(
                        updated.room().name(),
                        updated.room().description(),
                        java.util.List.of(RoomCategory.ENVIRONMENT),
                        updated.room().visibility(),
                        updated.room().joinPolicy());
        assertThat(unchanged.outcome())
                .isEqualTo(RoomSettingsUpdateOutcome.UNCHANGED);
        assertThat(unchanged.room()).isSameAs(updated.room());
    }

    @Test
    void identicalCanonicalSettingsAreUnchanged() {
        Room original = room(
                "Description",
                RoomStatus.ACTIVE,
                7);

        RoomSettingsUpdateTransition transition =
                original.updateSettings(
                        "  Room  ",
                        "  Description  ",
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN);

        assertThat(transition.outcome())
                .isEqualTo(RoomSettingsUpdateOutcome.UNCHANGED);
        assertThat(transition.room()).isSameAs(original);
        assertThat(transition.room().version()).isEqualTo(7);
    }

    @Test
    void validatesDescriptionByUnicodeCodePointAndControlPolicy() {
        String maximum = "😀".repeat(
                Room.MAX_DESCRIPTION_CODE_POINTS);
        assertThat(room(maximum, RoomStatus.ACTIVE, 0).description())
                .hasSize(1_000)
                .hasSizeGreaterThan(
                        Room.MAX_DESCRIPTION_CODE_POINTS);

        assertThatThrownBy(() -> room(
                maximum + "a",
                RoomStatus.ACTIVE,
                0))
                .isInstanceOf(RoomDomainException.class)
                .extracting(exception ->
                        ((RoomDomainException) exception).code())
                .isEqualTo(
                        RoomDomainErrorCode.INVALID_ROOM_DESCRIPTION);
        assertThatThrownBy(() -> room(
                "allowed\tline\nnext\rline\u0001",
                RoomStatus.ACTIVE,
                0))
                .isInstanceOf(RoomDomainException.class)
                .extracting(exception ->
                        ((RoomDomainException) exception).code())
                .isEqualTo(
                        RoomDomainErrorCode.INVALID_ROOM_DESCRIPTION);
    }

    @Test
    void rejectsEveryForbiddenC0BeforeStrippingAtEveryPosition() {
        Room existing = room("", RoomStatus.ACTIVE, 0);
        for (int codePoint = 0; codePoint <= 0x1f; codePoint++) {
            if (allowedDescriptionControl(codePoint)) {
                continue;
            }
            String control = Character.toString(codePoint);
            for (String description : new String[]{
                    control + "description",
                    "description" + control,
                    "description" + control + "text"}) {
                assertInvalidDescription(
                        () -> room(
                                description,
                                RoomStatus.ACTIVE,
                                0),
                        codePoint,
                        description);
                assertInvalidDescription(
                        () -> existing.updateSettings(
                                existing.name(),
                                description,
                                existing.visibility(),
                                existing.joinPolicy()),
                        codePoint,
                        description);
            }
        }
    }

    @Test
    void keepsAllowedInternalControlsAndStripsBoundaryWhitespace() {
        assertThat(room(
                "line1\tline2",
                RoomStatus.ACTIVE,
                0).description()).isEqualTo("line1\tline2");
        assertThat(room(
                "line1\nline2",
                RoomStatus.ACTIVE,
                0).description()).isEqualTo("line1\nline2");
        assertThat(room(
                "line1\rline2",
                RoomStatus.ACTIVE,
                0).description()).isEqualTo("line1\rline2");
        assertThat(room(
                "  description  ",
                RoomStatus.ACTIVE,
                0).description()).isEqualTo("description");
        assertThat(room(
                "\tdescription\n",
                RoomStatus.ACTIVE,
                0).description()).isEqualTo("description");
    }

    @Test
    void canonicalSnapshotValidatorsRejectBoundaryControls() {
        assertThatThrownBy(() -> new RoomSettingsSnapshot(
                "Room",
                "\u000bdescription",
                java.util.List.of(RoomCategory.POLICY),
                RoomVisibility.LISTED,
                JoinPolicy.OPEN))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() ->
                new RoomSettingsUpdatedEventPayload(
                        "room-1",
                        1,
                        RoomStatus.ACTIVE,
                        "Room",
                        "description\u000c",
                        java.util.List.of(RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void closedRoomCannotUpdateSettings() {
        Room closed = room(
                "",
                RoomStatus.CLOSED,
                7);

        assertThatThrownBy(() -> closed.updateSettings(
                "Changed",
                "",
                RoomVisibility.UNLISTED,
                JoinPolicy.INVITE_ONLY))
                .isInstanceOf(RoomDomainException.class)
                .extracting(exception ->
                        ((RoomDomainException) exception).code())
                .isEqualTo(RoomDomainErrorCode.ROOM_CLOSED);
    }

    @Test
    void existingTransitionsPreserveDescription() {
        Room original = room(
                "Keep me",
                RoomStatus.ACTIVE,
                7);

        Room joined = original.memberJoined();
        Room transferred = joined.transferOwnershipTo("owner-2");
        Room closed = transferred.closeAt(
                CREATED_AT.plusSeconds(60));

        assertThat(joined.description()).isEqualTo("Keep me");
        assertThat(transferred.description()).isEqualTo("Keep me");
        assertThat(closed.description()).isEqualTo("Keep me");
        assertThat(original.toString()).contains("Keep me");
        assertThat(original).isNotEqualTo(room(
                "Different",
                RoomStatus.ACTIVE,
                7));
    }

    private Room room(
            String description,
            RoomStatus status,
            long version
    ) {
        return Room.restore(
                "room-1",
                "Room",
                description,
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "owner-1",
                status,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                status == RoomStatus.ACTIVE ? 1 : 0,
                CREATED_AT,
                status == RoomStatus.CLOSED
                        ? CREATED_AT.plusSeconds(30)
                        : null,
                version);
    }

    private void assertInvalidDescription(
            Runnable operation,
            int codePoint,
            String description
    ) {
        assertThatThrownBy(operation::run)
                .as(
                        "U+%04X in %s",
                        codePoint,
                        printable(description))
                .isInstanceOf(RoomDomainException.class)
                .extracting(exception ->
                        ((RoomDomainException) exception).code())
                .isEqualTo(
                        RoomDomainErrorCode.INVALID_ROOM_DESCRIPTION);
    }

    private boolean allowedDescriptionControl(int codePoint) {
        return codePoint == '\t'
                || codePoint == '\n'
                || codePoint == '\r';
    }

    private String printable(String value) {
        StringBuilder result = new StringBuilder();
        value.codePoints().forEach(codePoint -> {
            if (codePoint < 0x20) {
                result.append(String.format("\\u%04X", codePoint));
            } else {
                result.appendCodePoint(codePoint);
            }
        });
        return result.toString();
    }
}
