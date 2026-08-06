package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomCategories;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;

import java.util.List;
import java.util.Objects;

public record RoomSettingsUpdatedEventPayload(
        String roomId,
        long roomVersion,
        RoomStatus roomStatus,
        String name,
        String description,
        List<RoomCategory> categories,
        RoomVisibility visibility,
        JoinPolicy joinPolicy
) implements RoomEventPayload {

    public RoomSettingsUpdatedEventPayload {
        roomId = RoomEventValidation.requireRoomId(roomId);
        roomVersion = RoomEventValidation.requireVersion(
                roomVersion,
                "roomVersion");
        Objects.requireNonNull(roomStatus, "roomStatus");
        name = RoomEventValidation.requireText(name, "name");
        if (!name.equals(name.trim())
                || name.length() > Room.MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "Settings event name is not canonical");
        }
        requireCanonicalDescription(description);
        categories = RoomCategories.requireValid(categories);
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
        if (roomStatus != RoomStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "Settings event room must be active");
        }
    }

    private static void requireCanonicalDescription(String value) {
        Objects.requireNonNull(value, "description");
        if (!value.equals(value.strip())
                || value.codePointCount(0, value.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "Settings event description is not canonical");
        }
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            if (codePoint < 0x20
                    && codePoint != '\t'
                    && codePoint != '\n'
                    && codePoint != '\r') {
                throw new IllegalArgumentException(
                        "Settings event description has an invalid "
                                + "control character");
            }
            offset += Character.charCount(codePoint);
        }
    }
}
