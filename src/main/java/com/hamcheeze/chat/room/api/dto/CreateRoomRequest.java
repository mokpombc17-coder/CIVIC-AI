package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateRoomRequest(
        @NotBlank
        @Size(max = Room.MAX_NAME_LENGTH)
        String name,
        @NotNull RoomVisibility visibility,
        @NotNull JoinPolicy joinPolicy
) {
}
