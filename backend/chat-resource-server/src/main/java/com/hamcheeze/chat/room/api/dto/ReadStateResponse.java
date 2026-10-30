package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.inbox.ReadStateResult;

public record ReadStateResponse(
        String roomId,
        long readThroughSequence,
        boolean updated
) {
    public static ReadStateResponse from(ReadStateResult result) {
        return new ReadStateResponse(
                result.roomId(),
                result.readThroughSequence(),
                result.updated());
    }
}
