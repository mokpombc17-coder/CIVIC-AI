package com.hamcheeze.chat.room.api.dto;

import java.util.List;

public record RoomParticipationListResponse(
        List<RoomParticipationResponse> items
) {

    public RoomParticipationListResponse {
        items = List.copyOf(items);
    }
}
