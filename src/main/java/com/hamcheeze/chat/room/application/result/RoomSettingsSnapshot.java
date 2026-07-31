package com.hamcheeze.chat.room.application.result;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomVisibility;

import java.util.Objects;

public record RoomSettingsSnapshot(
        String name,
        String description,
        RoomVisibility visibility,
        JoinPolicy joinPolicy
) {

    public RoomSettingsSnapshot {
        if (name == null
                || name.isBlank()
                || !name.equals(name.trim())
                || name.length() > Room.MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "name is not canonical");
        }
        requireCanonicalDescription(description);
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
    }

    private static void requireCanonicalDescription(String value) {
        Objects.requireNonNull(value, "description");
        if (!value.equals(value.strip())
                || value.codePointCount(0, value.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "description is not canonical");
        }
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            if (codePoint < 0x20
                    && codePoint != '\t'
                    && codePoint != '\n'
                    && codePoint != '\r') {
                throw new IllegalArgumentException(
                        "description has an invalid control character");
            }
            offset += Character.charCount(codePoint);
        }
    }
}
