package com.hamcheeze.chat.room;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RoomParticipationTest {

    private static final Instant JOINED_AT =
            Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void normalParticipationCapturesAnonymousIdentityAndEntryBoundary() {
        Membership membership = Membership.createMember(
                "membership-1",
                "room-1",
                "user-1",
                JOINED_AT,
                12,
                7);

        RoomParticipation participation = RoomParticipation.normal(
                "participation-1",
                membership);

        assertThat(participation.origin())
                .isEqualTo(ParticipationOrigin.NORMAL);
        assertThat(participation.status())
                .isEqualTo(ParticipationStatus.ACTIVE);
        assertThat(participation.profile().participantNumber())
                .isEqualTo(7);
        assertThat(participation.enteredAfterMessageSequence())
                .isEqualTo(12);
    }

    @Test
    void endingParticipationKeepsHistoryAndCapturesExitBoundary() {
        Membership membership = Membership.createMember(
                "membership-1",
                "room-1",
                "user-1",
                JOINED_AT,
                12,
                7);
        RoomParticipation active = RoomParticipation.normal(
                "participation-1",
                membership);
        Instant leftAt = JOINED_AT.plusSeconds(30);

        RoomParticipation ended = active.end(
                leftAt,
                25,
                ParticipationEndReason.LEFT);

        assertThat(ended.status())
                .isEqualTo(ParticipationStatus.ENDED);
        assertThat(ended.endedAt()).isEqualTo(leftAt);
        assertThat(ended.endedAfterMessageSequence()).isEqualTo(25);
        assertThat(ended.version()).isEqualTo(1);
    }

    @Test
    void rejoinGetsANewAnonymousIdentityAndAdvancesNumber() {
        RoomCreationResult created = RoomMembershipTransitions.createRoom(
                "room-1",
                "room",
                "description",
                java.util.List.of(RoomCategory.POLICY),
                "owner-membership",
                "owner-user",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                JOINED_AT);
        JoinRoomTransition joined = RoomMembershipTransitions.joinRoom(
                created.room(),
                null,
                "membership-1",
                "user-1",
                JOINED_AT.plusSeconds(1),
                0);
        LeaveRoomTransition left = RoomMembershipTransitions.leaveRoom(
                joined.room(),
                joined.membership(),
                "user-1",
                JOINED_AT.plusSeconds(2));

        JoinRoomTransition rejoined = RoomMembershipTransitions.joinRoom(
                left.room(),
                left.membership(),
                "unused-membership-id",
                "user-1",
                JOINED_AT.plusSeconds(3),
                10);

        assertThat(joined.membership().profile().participantNumber())
                .isEqualTo(2);
        assertThat(rejoined.membership().profile().participantNumber())
                .isEqualTo(3);
        assertThat(rejoined.room().nextParticipantNumber())
                .isEqualTo(4);
    }

    @Test
    void disabledParticipationModeKeepsLegacyRejoinIdentity() {
        RoomCreationResult created = RoomMembershipTransitions.createRoom(
                "room-1",
                "room",
                "description",
                java.util.List.of(RoomCategory.POLICY),
                "owner-membership",
                "owner-user",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                JOINED_AT);
        JoinRoomTransition joined = RoomMembershipTransitions.joinRoom(
                created.room(),
                null,
                "membership-1",
                "user-1",
                JOINED_AT.plusSeconds(1),
                0);
        LeaveRoomTransition left = RoomMembershipTransitions.leaveRoom(
                joined.room(),
                joined.membership(),
                "user-1",
                JOINED_AT.plusSeconds(2));

        JoinRoomTransition rejoined = RoomMembershipTransitions.joinRoom(
                left.room(),
                left.membership(),
                "unused-membership-id",
                "user-1",
                JOINED_AT.plusSeconds(3),
                10,
                false);

        assertThat(rejoined.membership().profile())
                .isSameAs(left.membership().profile());
        assertThat(rejoined.room().nextParticipantNumber())
                .isEqualTo(3);
    }
}
