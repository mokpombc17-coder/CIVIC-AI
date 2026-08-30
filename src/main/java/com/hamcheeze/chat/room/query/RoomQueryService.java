package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.query.RoomQueryCursor.Scope;
import com.hamcheeze.chat.room.query.model.ActiveRoomView;
import com.hamcheeze.chat.room.query.model.MembershipView;
import com.hamcheeze.chat.room.query.model.RoomDetailView;
import com.hamcheeze.chat.room.query.model.RoomMemberView;
import com.hamcheeze.chat.userlabel.UserLabel;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class RoomQueryService {

    private final RoomQueryReader reader;
    private final RoomQueryCursorCodec cursorCodec;
    private final UserLabelDirectory userLabels;

    public RoomQueryService(
            RoomQueryReader reader,
            RoomQueryCursorCodec cursorCodec
    ) {
        this(reader, cursorCodec, UserLabelDirectory.noop());
    }

    public RoomQueryService(
            RoomQueryReader reader,
            RoomQueryCursorCodec cursorCodec,
            UserLabelDirectory userLabels
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.cursorCodec =
                Objects.requireNonNull(cursorCodec, "cursorCodec");
        this.userLabels = Objects.requireNonNull(
                userLabels,
                "userLabels");
    }

    public RoomDetailView roomDetail(
            String requesterUserId,
            String roomId
    ) {
        Room room = requireRoom(roomId);
        Membership membership = reader.findMembership(
                        roomId,
                        requesterUserId)
                .orElse(null);
        return new RoomDetailView(
                room.roomId(),
                room.name(),
                room.description(),
                room.categoryIds(),
                room.ownerMembershipId(),
                room.ownerUserId(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.activeMemberCount(),
                room.createdAt(),
                room.closedAt(),
                room.version(),
                participation(room, membership),
                membership == null
                        ? null
                        : MembershipView.from(membership));
    }

    public MembershipView myMembership(
            String requesterUserId,
            String roomId
    ) {
        requireRoom(roomId);
        Membership membership = reader.findMembership(
                        roomId,
                        requesterUserId)
                .orElseThrow(() -> new RoomQueryException(
                        RoomQueryErrorCode.MEMBERSHIP_NOT_FOUND,
                        "Room membership was not found"));
        return MembershipView.from(membership);
    }

    public CursorPage<ActiveRoomView> activeRooms(
            String requesterUserId,
            String cursor,
            int limit
    ) {
        RoomQueryCursor decoded = cursorCodec.decode(
                cursor,
                Scope.MY_ACTIVE_ROOMS,
                MembershipStatus.ACTIVE);
        CursorSlice<Membership> memberships =
                reader.findMembershipsByUserAndStatus(
                        requesterUserId,
                        MembershipStatus.ACTIVE,
                        decoded == null
                                ? null
                                : decoded.lastMembershipId(),
                        limit);
        List<String> roomIds = memberships.items().stream()
                .map(Membership::roomId)
                .distinct()
                .toList();
        Map<String, Room> roomsById = reader
                .findRoomsByIds(roomIds)
                .stream()
                .collect(Collectors.toMap(
                        Room::roomId,
                        Function.identity()));
        List<ActiveRoomView> views = memberships.items().stream()
                .map(membership -> activeRoomView(
                        roomsById.get(membership.roomId()),
                        membership))
                .filter(Objects::nonNull)
                .toList();
        return page(
                views,
                memberships,
                Scope.MY_ACTIVE_ROOMS,
                MembershipStatus.ACTIVE);
    }

    public CursorPage<RoomMemberView> roomMembers(
            String requesterUserId,
            String roomId,
            MembershipStatus status,
            String cursor,
            int limit
    ) {
        Room room = requireRoom(roomId);
        Membership requesterMembership = reader.findMembership(
                        roomId,
                        requesterUserId)
                .orElse(null);
        boolean owner = room.ownerUserId().equals(requesterUserId);
        if (status == MembershipStatus.ACTIVE
                && (room.status() != RoomStatus.ACTIVE
                || requesterMembership == null
                || requesterMembership.status()
                != MembershipStatus.ACTIVE)) {
            throw new RoomQueryException(
                    RoomQueryErrorCode.ACCESS_DENIED,
                    "An active membership is required to list "
                            + "active Room participants");
        }
        if (status != MembershipStatus.ACTIVE && !owner) {
            throw new RoomQueryException(
                    RoomQueryErrorCode.NOT_ROOM_OWNER,
                    "Only the room owner can list inactive "
                            + "memberships");
        }
        RoomQueryCursor decoded = cursorCodec.decode(
                cursor,
                Scope.ROOM_MEMBERSHIPS,
                status);
        CursorSlice<Membership> memberships =
                reader.findMembershipsByRoomAndStatus(
                        roomId,
                        status,
                        decoded == null
                                ? null
                                : decoded.lastMembershipId(),
                        limit);
        Map<String, String> labelsByUserId =
                userLabels.findByUserIds(
                        memberships.items().stream()
                                .map(Membership::userId)
                                .toList());
        List<RoomMemberView> views = memberships.items().stream()
                .map(membership -> new RoomMemberView(
                        membership.membershipId(),
                        membership.userId(),
                        labelsByUserId.getOrDefault(
                                membership.userId(),
                                UserLabel.fallback(
                                        membership.userId(),
                                        membership.profile()
                                                .displayName())),
                        membership.profile().displayName(),
                        membership.profile().imageUrl(),
                        membership.profile().version(),
                        membership.role(),
                        membership.status(),
                        membership.joinedAt(),
                        membership.leftAt(),
                        membership.bannedAt(),
                        membership.version()))
                .toList();
        return page(
                views,
                memberships,
                Scope.ROOM_MEMBERSHIPS,
                status);
    }

    private Room requireRoom(String roomId) {
        return reader.findRoomById(roomId)
                .orElseThrow(() -> new RoomQueryException(
                        RoomQueryErrorCode.ROOM_NOT_FOUND,
                        "Room was not found"));
    }

    private RoomParticipationStatus participation(
            Room room,
            Membership membership
    ) {
        if (room.status() == RoomStatus.CLOSED) {
            return RoomParticipationStatus.ROOM_CLOSED;
        }
        if (membership == null) {
            return RoomParticipationStatus.NOT_JOINED;
        }
        return RoomParticipationStatus.valueOf(
                membership.status().name());
    }

    private ActiveRoomView activeRoomView(
            Room room,
            Membership membership
    ) {
        if (room == null || room.status() != RoomStatus.ACTIVE
                || membership.status()
                != MembershipStatus.ACTIVE) {
            return null;
        }
        return new ActiveRoomView(
                room.roomId(),
                room.name(),
                room.description(),
                room.categoryIds(),
                room.ownerMembershipId(),
                room.ownerUserId(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.activeMemberCount(),
                room.createdAt(),
                room.version(),
                membership.membershipId(),
                membership.role(),
                membership.status(),
                membership.joinedAt(),
                membership.version());
    }

    private <T> CursorPage<T> page(
            List<T> views,
            CursorSlice<Membership> memberships,
            Scope scope,
            MembershipStatus status
    ) {
        boolean hasNext = memberships.hasNext();
        String nextCursor = null;
        if (hasNext) {
            Membership last = memberships.items().getLast();
            nextCursor = cursorCodec.encode(new RoomQueryCursor(
                    RoomQueryCursor.CURRENT_VERSION,
                    scope,
                    status,
                    last.membershipId()));
        }
        return new CursorPage<>(views, nextCursor, hasNext);
    }
}
