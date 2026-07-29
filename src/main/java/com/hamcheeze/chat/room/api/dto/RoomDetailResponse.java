package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.RoomParticipationStatus;
import com.hamcheeze.chat.room.query.model.RoomDetailView;

import java.time.Instant;

public record RoomDetailResponse(
        String roomId,
        String name,
        String ownerUserId,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        int activeMemberCount,
        Instant createdAt,
        Instant closedAt,
        long version,
        RoomParticipationStatus participationStatus,
        MembershipResponse myMembership
) {

    public static RoomDetailResponse from(RoomDetailView view) {
        return new RoomDetailResponse(
                view.roomId(),
                view.name(),
                view.ownerUserId(),
                view.status(),
                view.visibility(),
                view.joinPolicy(),
                view.activeMemberCount(),
                view.createdAt(),
                view.closedAt(),
                view.version(),
                view.participationStatus(),
                view.myMembership() == null
                        ? null
                        : MembershipResponse.from(
                                view.myMembership()));
    }
}
