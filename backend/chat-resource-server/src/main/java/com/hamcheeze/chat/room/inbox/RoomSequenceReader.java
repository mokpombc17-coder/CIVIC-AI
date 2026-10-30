package com.hamcheeze.chat.room.inbox;

public interface RoomSequenceReader {

    long currentSequence(String roomId);
}
