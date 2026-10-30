package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.receipt.RoomReadReceiptPosition;

public record RoomReadReceiptPositionResponse(
        String membershipId,
        long membershipVersion,
        long messageVisibleAfterSequence,
        long storedLastReadSequence
) {

    public static RoomReadReceiptPositionResponse from(
            RoomReadReceiptPosition position
    ) {
        return new RoomReadReceiptPositionResponse(
                position.membershipId(),
                position.membershipVersion(),
                position.messageVisibleAfterSequence(),
                position.storedLastReadSequence());
    }
}
