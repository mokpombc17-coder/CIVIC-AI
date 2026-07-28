package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.application.idempotency.RoomClientRequestId;
import org.springframework.http.HttpStatus;

public final class RoomIdempotencyKeyResolver {

    public static final String HEADER_NAME = "Idempotency-Key";

    public String resolve(String value) {
        try {
            return RoomClientRequestId.canonicalize(value);
        } catch (IllegalArgumentException exception) {
            throw new RoomApiInputException(
                    RoomApiErrorCode.INVALID_IDEMPOTENCY_KEY,
                    HttpStatus.BAD_REQUEST,
                    "Idempotency-Key must be a UUID");
        }
    }
}
