package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

import java.util.List;

public record RoomSettingsCommandResponse(
        String clientRequestId,
        RoomCommandResultCode code,
        boolean replayed,
        String roomId,
        String name,
        String description,
        List<RoomCategory> categories,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        long roomVersion
) {
}
