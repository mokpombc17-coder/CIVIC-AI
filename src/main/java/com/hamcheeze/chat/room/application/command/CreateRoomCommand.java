package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategories;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.persistence.RoomCommandType;

import java.util.List;
import java.util.Objects;

public record CreateRoomCommand(
        String requesterUserId,
        String clientRequestId,
        String name,
        String description,
        List<RoomCategory> categories,
        RoomVisibility visibility,
        JoinPolicy joinPolicy
) implements RoomCommand {

    public CreateRoomCommand {
        requesterUserId = RoomCommandValidation.requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomCommandValidation.clientRequestId(clientRequestId);
        name = RoomCommandValidation.roomName(name);
        description =
                RoomCommandValidation.optionalRoomDescription(description);
        categories = RoomCategories.requireValid(categories);
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
    }

    public CreateRoomCommand(
            String requesterUserId,
            String clientRequestId,
            String name,
            List<RoomCategory> categories,
            RoomVisibility visibility,
            JoinPolicy joinPolicy
    ) {
        this(
                requesterUserId,
                clientRequestId,
                name,
                "",
                categories,
                visibility,
                joinPolicy);
    }

    @Override
    public RoomCommandType commandType() {
        return RoomCommandType.CREATE_ROOM;
    }
}
