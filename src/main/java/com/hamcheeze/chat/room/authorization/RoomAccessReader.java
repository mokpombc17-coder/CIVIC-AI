package com.hamcheeze.chat.room.authorization;

public interface RoomAccessReader {

    RoomAccessSnapshot readAccess(String userId, String roomId);
}
