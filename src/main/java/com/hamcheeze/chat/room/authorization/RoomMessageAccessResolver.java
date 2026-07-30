package com.hamcheeze.chat.room.authorization;

import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public final class RoomMessageAccessResolver {

    private final RoomAccessReader accessReader;

    public RoomMessageAccessResolver(RoomAccessReader accessReader) {
        this.accessReader = Objects.requireNonNull(
                accessReader,
                "accessReader");
    }

    public RoomMessageAccess resolve(String userId, String roomId) {
        if (userId == null || userId.isBlank()
                || roomId == null || roomId.isBlank()) {
            return RoomMessageAccess.forbidden();
        }
        try {
            RoomAccessSnapshot snapshot =
                    accessReader.readAccess(userId, roomId);
            if (!snapshot.semanticallyValid()) {
                return RoomMessageAccess.unavailable();
            }
            if (snapshot.state() != RoomAccessState.ACTIVE_MEMBER) {
                return RoomMessageAccess.forbidden();
            }
            return RoomMessageAccess.allowed(
                    snapshot.messageVisibleAfterSequence());
        } catch (RuntimeException exception) {
            return RoomMessageAccess.unavailable();
        }
    }
}
