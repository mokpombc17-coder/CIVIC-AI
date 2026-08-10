package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.authorization.RoomAccessSnapshot;
import com.hamcheeze.chat.room.authorization.RoomAccessState;

import java.util.Objects;
import java.util.regex.Pattern;

public final class ChatMessageSearchAccessResolver {

    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private final RoomAccessReader accessReader;

    public ChatMessageSearchAccessResolver(
            RoomAccessReader accessReader
    ) {
        this.accessReader = Objects.requireNonNull(
                accessReader,
                "accessReader");
    }

    public ChatMessageSearchAccess resolve(
            String userId,
            String roomId
    ) {
        if (userId == null || userId.isBlank()
                || roomId == null
                || !ROOM_ID.matcher(roomId).matches()) {
            return ChatMessageSearchAccess.accessDenied();
        }
        try {
            RoomAccessSnapshot snapshot =
                    accessReader.readAccess(userId, roomId);
            if (!roomId.equals(snapshot.roomId())
                    || !snapshot.semanticallyValid()) {
                return ChatMessageSearchAccess.unavailable();
            }
            return map(snapshot);
        } catch (RuntimeException exception) {
            return ChatMessageSearchAccess.unavailable();
        }
    }

    private ChatMessageSearchAccess map(
            RoomAccessSnapshot snapshot
    ) {
        return switch (snapshot.state()) {
            case ACTIVE_MEMBER -> ChatMessageSearchAccess.allowed(
                    snapshot.membershipId(),
                    snapshot.membershipVersion(),
                    snapshot.messageVisibleAfterSequence());
            case ROOM_CLOSED ->
                    ChatMessageSearchAccess.roomNotAvailable();
            case ROOM_NOT_FOUND,
                    MEMBERSHIP_NOT_FOUND,
                    MEMBERSHIP_LEFT,
                    MEMBERSHIP_BANNED ->
                    ChatMessageSearchAccess.accessDenied();
        };
    }
}
