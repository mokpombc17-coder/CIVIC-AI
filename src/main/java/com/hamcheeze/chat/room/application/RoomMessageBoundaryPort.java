package com.hamcheeze.chat.room.application;

public interface RoomMessageBoundaryPort {

    long captureCurrentSequence(String roomId);
}
