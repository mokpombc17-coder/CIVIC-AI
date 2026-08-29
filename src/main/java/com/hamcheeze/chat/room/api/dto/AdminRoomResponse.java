package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.model.AdminRoomView;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record AdminRoomResponse(
        String roomId,
        String name,
        String description,
        List<String> categoryIds,
        List<RoomCategorySummaryResponse> categorySummaries,
        String ownerMembershipId,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        int activeMemberCount,
        Instant createdAt,
        long version
) {

    public static AdminRoomResponse from(
            AdminRoomView view,
            Map<String, RoomCategorySummaryResponse>
                    categorySummariesById
    ) {
        return new AdminRoomResponse(
                view.roomId(),
                view.name(),
                view.description(),
                view.categoryIds(),
                RoomCategorySummaryResponse.resolve(
                        view.categoryIds(),
                        categorySummariesById),
                view.ownerMembershipId(),
                view.status(),
                view.visibility(),
                view.joinPolicy(),
                view.activeMemberCount(),
                view.createdAt(),
                view.version());
    }
}
