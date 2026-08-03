package com.hamcheeze.chat.room.inbox;

public record UnreadCount(
        int value,
        boolean capped
) {
    public UnreadCount {
        if (value < 0) {
            throw new IllegalArgumentException(
                    "Unread count must not be negative");
        }
    }
}
