package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.RoomStatus;

public sealed interface RoomEventPayload
        permits RoomCreatedEventPayload,
        RoomMemberChangedEventPayload,
        RoomOwnershipTransferredEventPayload,
        RoomClosedEventPayload,
        RoomSettingsUpdatedEventPayload {

    String roomId();

    long roomVersion();

    RoomStatus roomStatus();
}
