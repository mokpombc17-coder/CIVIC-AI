package com.hamcheeze.chat.message;

public sealed interface StoreChatMessageResult
        permits StoredChatMessage,
        DuplicateChatMessage,
        ConflictingChatMessage {
}
