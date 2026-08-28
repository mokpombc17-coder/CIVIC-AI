package com.hamcheeze.chat.room.category;

import com.hamcheeze.chat.room.Room;

import java.util.Objects;

public record RoomCategoryAssignment(
        Room room,
        boolean changed
) {

    public RoomCategoryAssignment {
        Objects.requireNonNull(room, "room");
    }
}
