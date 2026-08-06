package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomCategories;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateRoomRequest(
        @NotBlank
        @Size(max = Room.MAX_NAME_LENGTH)
        String name,
        String description,
        @NotNull
        @Size(
                min = RoomCategories.MIN_SELECTIONS,
                max = RoomCategories.MAX_SELECTIONS)
        List<@NotNull RoomCategory> categories,
        @NotNull RoomVisibility visibility,
        @NotNull JoinPolicy joinPolicy
) {

    public CreateRoomRequest {
        description = canonicalDescription(description);
        if (categories != null) {
            categories = RoomCategories.requireValid(categories);
        }
    }

    public CreateRoomRequest(
            String name,
            List<RoomCategory> categories,
            RoomVisibility visibility,
            JoinPolicy joinPolicy
    ) {
        this(name, "", categories, visibility, joinPolicy);
    }

    private static String canonicalDescription(String value) {
        String raw = value == null ? "" : value;
        requireAllowedDescriptionControlCharacters(raw);
        String canonical = raw.strip();
        if (canonical.codePointCount(0, canonical.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "description is too long");
        }
        return canonical;
    }

    private static void requireAllowedDescriptionControlCharacters(
            String description
    ) {
        for (int offset = 0; offset < description.length();) {
            int codePoint = description.codePointAt(offset);
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
