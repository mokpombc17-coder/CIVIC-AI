package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.room.api.RoomApiErrorCode;
import com.hamcheeze.chat.room.api.RoomApiInputException;
import org.springframework.http.HttpStatus;

import java.util.regex.Pattern;

final class ChatMessageQueryValidation {

    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 100;

    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private ChatMessageQueryValidation() {
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

    static long afterSequence(Long afterSequence) {
        long resolved = afterSequence == null ? 0 : afterSequence;
        if (resolved < 0) {
            throw new RoomApiInputException(
                    RoomApiErrorCode.INVALID_REQUEST,
                    HttpStatus.BAD_REQUEST,
                    "afterSequence must not be negative");
        }
        return resolved;
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
