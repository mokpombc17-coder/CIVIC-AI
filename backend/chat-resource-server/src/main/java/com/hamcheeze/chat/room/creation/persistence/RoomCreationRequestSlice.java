package com.hamcheeze.chat.room.creation.persistence;

import com.hamcheeze.chat.room.creation.RoomCreationRequest;

import java.util.List;

public record RoomCreationRequestSlice(
        List<RoomCreationRequest> items,
        boolean hasNext
) {

    public RoomCreationRequestSlice {
        items = List.copyOf(items);
    }
}
