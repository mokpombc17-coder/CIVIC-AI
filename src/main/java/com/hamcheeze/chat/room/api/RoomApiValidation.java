package com.hamcheeze.chat.room.api;

import org.springframework.http.HttpStatus;

import java.util.regex.Pattern;

final class RoomApiValidation {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 100;

    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private RoomApiValidation() {
    }

    static String roomId(String roomId) {
        if (roomId == null
                || !ROOM_ID.matcher(roomId).matches()) {
            throw new RoomApiInputException(
                    RoomApiErrorCode.INVALID_ROOM_ID,
                    HttpStatus.BAD_REQUEST,
                    "roomId has an invalid format");
        }
        return roomId;
    }

    static int limit(Integer limit) {
        int resolved = limit == null ? DEFAULT_LIMIT : limit;
        if (resolved < 1 || resolved > MAX_LIMIT) {
            throw new RoomApiInputException(
                    RoomApiErrorCode.INVALID_REQUEST,
                    HttpStatus.BAD_REQUEST,
                    "limit must be between 1 and 100");
        }
        return resolved;
    }
}
