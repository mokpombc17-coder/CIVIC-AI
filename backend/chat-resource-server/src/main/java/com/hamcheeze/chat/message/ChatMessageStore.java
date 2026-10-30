package com.hamcheeze.chat.message;

public interface ChatMessageStore {

    StoreChatMessageResult append(NewChatMessage message);
}
