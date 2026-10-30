package com.hamcheeze.chat.room.application.idempotency;

import com.hamcheeze.chat.room.application.result.RoomCommandResult;

@FunctionalInterface
public interface RoomTransactionalAction {

    RoomCommandResult execute();
}
