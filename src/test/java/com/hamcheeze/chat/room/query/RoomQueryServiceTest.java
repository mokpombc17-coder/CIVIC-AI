package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.model.ActiveRoomView;
import com.hamcheeze.chat.room.query.model.RoomMemberView;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomQueryServiceTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-28T00:00:00Z");

    private final RoomQueryReader reader =
            mock(RoomQueryReader.class);
    private final UserLabelDirectory userLabels =
            mock(UserLabelDirectory.class);
    private final RoomQueryService service = new RoomQueryService(
            reader,
            new RoomQueryCursorCodec(
                    JsonMapper.builder().build()),
            userLabels);

    @Test
    void participationUsesRoomClosedBeforeRawMembershipStatus() {
        Room active = room("room-1", RoomStatus.ACTIVE);
        Room closed = room("room-2", RoomStatus.CLOSED);
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(active));
        when(reader.findRoomById("room-2"))
                .thenReturn(Optional.of(closed));
        when(reader.findMembership("room-1", "none"))
                .thenReturn(Optional.empty());
        when(reader.findMembership("room-1", "active"))
                .thenReturn(Optional.of(membership(
                        "m-active",
                        "room-1",
                        "active",
                        MembershipStatus.ACTIVE)));
        when(reader.findMembership("room-1", "left"))
                .thenReturn(Optional.of(membership(
                        "m-left",
                        "room-1",
                        "left",
                        MembershipStatus.LEFT)));
        when(reader.findMembership("room-1", "banned"))
                .thenReturn(Optional.of(membership(
                        "m-banned",
                        "room-1",
                        "banned",
                        MembershipStatus.BANNED)));
        Membership closedOwner = Membership.restore(
                "m-owner",
                "room-2",
                "owner-1",
                MembershipRole.OWNER,
                MembershipStatus.LEFT,
                com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                CREATED_AT,
                CREATED_AT.plusSeconds(60),
                null,
                0,
                1);
        when(reader.findMembership("room-2", "owner-1"))
                .thenReturn(Optional.of(closedOwner));

        assertThat(service.roomDetail("none", "room-1")
                .participationStatus())
                .isEqualTo(RoomParticipationStatus.NOT_JOINED);
        assertThat(service.roomDetail("none", "room-1").name())
                .isEqualTo("room-1");
        assertThat(service.roomDetail("active", "room-1")
                .participationStatus())
                .isEqualTo(RoomParticipationStatus.ACTIVE);
        assertThat(service.roomDetail("left", "room-1")
                .participationStatus())
                .isEqualTo(RoomParticipationStatus.LEFT);
        assertThat(service.roomDetail("banned", "room-1")
                .participationStatus())
                .isEqualTo(RoomParticipationStatus.BANNED);
        assertThat(service.roomDetail("owner-1", "room-2")
                .participationStatus())
                .isEqualTo(RoomParticipationStatus.ROOM_CLOSED);
        assertThat(service.roomDetail("owner-1", "room-2")
                .myMembership().status())
                .isEqualTo(MembershipStatus.LEFT);
    }

    @Test
    void activeRoomsUsesOneMembershipPageAndOneRoomBatch() {
        Membership first = membership(
                "m-01",
                "room-1",
                "user-1",
                MembershipStatus.ACTIVE);
        Membership second = membership(
                "m-02",
                "room-2",
                "user-1",
                MembershipStatus.ACTIVE);
        when(reader.findMembershipsByUserAndStatus(
                "user-1",
                MembershipStatus.ACTIVE,
                null,
                20))
                .thenReturn(new CursorSlice<>(
                        List.of(first, second),
                        false));
        when(reader.findRoomsByIds(
                List.of("room-1", "room-2")))
                .thenReturn(List.of(
                        room("room-2", RoomStatus.CLOSED),
                        room("room-1", RoomStatus.ACTIVE)));

        CursorPage<ActiveRoomView> page =
                service.activeRooms(
                        "user-1",
                        null,
                        20);

        assertThat(page.items())
                .extracting(ActiveRoomView::roomId)
                .containsExactly("room-1");
        assertThat(page.items())
                .extracting(ActiveRoomView::name)
                .containsExactly("room-1");
        assertThat(page.items())
                .extracting(ActiveRoomView::ownerMembershipId)
                .containsExactly("membership-owner");
        verify(reader).findMembershipsByUserAndStatus(
                "user-1",
                MembershipStatus.ACTIVE,
                null,
                20);
        verify(reader).findRoomsByIds(
                List.of("room-1", "room-2"));
    }

    @Test
    void activeMemberCanListActiveParticipantsWithProfiles() {
        Room room = room("room-1", RoomStatus.ACTIVE);
        Membership requester = membership(
                "m-01",
                "room-1",
                "user-1",
                MembershipStatus.ACTIVE);
        Membership participant = membership(
                "m-02",
                "room-1",
                "user-2",
                MembershipStatus.ACTIVE);
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(room));
        when(reader.findMembership("room-1", "user-1"))
                .thenReturn(Optional.of(requester));
        when(reader.findMembershipsByRoomAndStatus(
                "room-1",
                MembershipStatus.ACTIVE,
                null,
                20))
                .thenReturn(new CursorSlice<>(
                        List.of(requester, participant),
                        false));
        when(userLabels.findByUserIds(
                List.of("user-1", "user-2")))
                .thenReturn(Map.of(
                        "user-1", "owner",
                        "user-2", "participant"));

        CursorPage<RoomMemberView> page = service.roomMembers(
                "user-1",
                "room-1",
                MembershipStatus.ACTIVE,
                null,
                20);

        assertThat(page.items())
                .extracting(RoomMemberView::membershipId)
                .containsExactly("m-01", "m-02");
        assertThat(page.items())
                .extracting(RoomMemberView::userLabel)
                .containsExactly("owner", "participant");
        assertThat(page.items())
                .extracting(RoomMemberView::displayName)
                .containsExactly("참여자 2", "참여자 2");
        assertThat(page.items())
                .extracting(RoomMemberView::imageUrl)
                .containsOnlyNulls();
        assertThat(page.items())
                .extracting(RoomMemberView::profileVersion)
                .containsExactly(1L, 1L);
    }

    @Test
    void opaqueUuidWithoutRegisteredLabelUsesDisplayNameFallback() {
        String userId =
                "46fd4756-f07f-4b54-b03a-6e07740317da";
        Room room = room("room-1", RoomStatus.ACTIVE);
        Membership requester = membership(
                "m-01",
                "room-1",
                userId,
                MembershipStatus.ACTIVE);
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(room));
        when(reader.findMembership("room-1", userId))
                .thenReturn(Optional.of(requester));
        when(reader.findMembershipsByRoomAndStatus(
                "room-1",
                MembershipStatus.ACTIVE,
                null,
                20))
                .thenReturn(new CursorSlice<>(
                        List.of(requester),
                        false));
        when(userLabels.findByUserIds(List.of(userId)))
                .thenReturn(Map.of());

        CursorPage<RoomMemberView> page = service.roomMembers(
                userId,
                "room-1",
                MembershipStatus.ACTIVE,
                null,
                20);

        assertThat(page.items())
                .extracting(RoomMemberView::userLabel)
                .containsExactly("참여자 2");
    }

    @Test
    void inactiveOrMissingMembershipCannotListActiveParticipants() {
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(
                        "room-1",
                        RoomStatus.ACTIVE)));
        when(reader.findMembership("room-1", "user-1"))
                .thenReturn(Optional.of(membership(
                        "m-01",
                        "room-1",
                        "user-1",
                        MembershipStatus.LEFT)));

        assertThatThrownBy(() -> service.roomMembers(
                "user-1",
                "room-1",
                MembershipStatus.ACTIVE,
                null,
                20))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.ACCESS_DENIED);

        assertThatThrownBy(() -> service.roomMembers(
                "missing-user",
                "room-1",
                MembershipStatus.ACTIVE,
                null,
                20))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.ACCESS_DENIED);
    }

    @Test
    void nonOwnerCannotListInactiveMemberships() {
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(
                        "room-1",
                        RoomStatus.ACTIVE)));
        when(reader.findMembership("room-1", "user-1"))
                .thenReturn(Optional.of(membership(
                        "m-01",
                        "room-1",
                        "user-1",
                        MembershipStatus.ACTIVE)));

        assertThatThrownBy(() -> service.roomMembers(
                "user-1",
                "room-1",
                MembershipStatus.BANNED,
                null,
                20))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.NOT_ROOM_OWNER);
    }

    private Room room(String roomId, RoomStatus status) {
        return Room.restore(
                roomId,
                roomId,
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                status,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                status == RoomStatus.ACTIVE ? 1 : 0,
                Math.max(2L, (long) (status == RoomStatus.ACTIVE ? 1 : 0) + 1L),
                CREATED_AT,
                status == RoomStatus.CLOSED
                        ? CREATED_AT.plusSeconds(60)
                        : null,
                status == RoomStatus.ACTIVE ? 0 : 1);
    }

    private Membership membership(
            String membershipId,
            String roomId,
            String userId,
            MembershipStatus status
    ) {
        return Membership.restore(
                membershipId,
                roomId,
                userId,
                MembershipRole.MEMBER,
                status,
                com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                CREATED_AT,
                status == MembershipStatus.LEFT
                        ? CREATED_AT.plusSeconds(10)
                        : null,
                status == MembershipStatus.BANNED
                        ? CREATED_AT.plusSeconds(10)
                        : null,
                0,
                0);
    }
}
