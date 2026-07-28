package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import jakarta.validation.constraints.NotNull;

public record CreateRoomRequest(
        @NotNull RoomVisibility visibility,
        @NotNull JoinPolicy joinPolicy
) {
}
