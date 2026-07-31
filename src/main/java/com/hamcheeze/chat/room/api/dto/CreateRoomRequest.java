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
        String description,
        @NotNull RoomVisibility visibility,
        @NotNull JoinPolicy joinPolicy
) {

    public CreateRoomRequest {
        description = canonicalDescription(description);
    }

    public CreateRoomRequest(
            String name,
            RoomVisibility visibility,
            JoinPolicy joinPolicy
    ) {
        this(name, "", visibility, joinPolicy);
    }

    private static String canonicalDescription(String value) {
        String canonical = value == null ? "" : value.strip();
        if (canonical.codePointCount(0, canonical.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "description is too long");
        }
        for (int offset = 0; offset < canonical.length();) {
            int codePoint = canonical.codePointAt(offset);
            if (codePoint < 0x20
                    && codePoint != '\t'
                    && codePoint != '\n'
                    && codePoint != '\r') {
                throw new IllegalArgumentException(
                        "description has an invalid control character");
            }
            offset += Character.charCount(codePoint);
        }
        return canonical;
    }
}
