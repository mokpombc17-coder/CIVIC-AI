package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.receipt.RoomReadReceiptState;

import java.time.Instant;
import java.util.List;

public record RoomReadReceiptStateResponse(
        String roomId,
        long roomVersion,
        String selfMembershipId,
        List<RoomReadReceiptPositionResponse> positions,
        Instant generatedAt
) {

    public static RoomReadReceiptStateResponse from(
            RoomReadReceiptState state
    ) {
        return new RoomReadReceiptStateResponse(
                state.roomId(),
                state.roomVersion(),
                state.selfMembershipId(),
                state.positions().stream()
                        .map(RoomReadReceiptPositionResponse::from)
                        .toList(),
                state.generatedAt());
    }
}
