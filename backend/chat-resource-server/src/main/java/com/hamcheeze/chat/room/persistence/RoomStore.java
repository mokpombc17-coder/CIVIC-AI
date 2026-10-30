package com.hamcheeze.chat.room.persistence;

import com.hamcheeze.chat.room.Room;

import java.util.Optional;

public interface RoomStore {

    Optional<Room> findById(String roomId);

    void insert(Room room);

    boolean replaceIfVersionMatches(
            Room room,
            long expectedVersion
    );
}
