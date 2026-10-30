package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;

import java.util.List;
import java.util.Optional;

public interface RoomQueryReader {

    Optional<Room> findRoomById(String roomId);

    Optional<Membership> findMembership(
            String roomId,
            String userId);

    CursorSlice<Membership> findMembershipsByUserAndStatus(
            String userId,
            MembershipStatus status,
            String afterMembershipId,
            int limit);

    CursorSlice<Membership> findMembershipsByRoomAndStatus(
            String roomId,
            MembershipStatus status,
            String afterMembershipId,
            int limit);

    List<Room> findRoomsByIds(List<String> roomIds);

    CursorSlice<Room> findListedRooms(
            ListedRoomQueryCriteria criteria,
            ListedRoomPosition after,
            int limit);

    CursorSlice<Room> findAdminRooms(
            AdminRoomQueryCriteria criteria,
            String afterRoomId,
            int limit);
}
