package com.hamcheeze.chat.room.creation;

public enum RoomCreationRequestResultCode {
    ROOM_CREATION_REQUESTED(RoomCreationRequestStatus.PENDING),
    ROOM_CREATED(RoomCreationRequestStatus.APPROVED),
    ROOM_CREATION_REJECTED(RoomCreationRequestStatus.REJECTED),
    ROOM_CREATION_CANCELED(RoomCreationRequestStatus.CANCELED);

    private final RoomCreationRequestStatus status;

    RoomCreationRequestResultCode(
            RoomCreationRequestStatus status
    ) {
        this.status = status;
    }

    public RoomCreationRequestStatus status() {
        return status;
    }
}
