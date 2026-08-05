package com.hamcheeze.chat.room.inbox.summary;

import com.hamcheeze.chat.message.ChatMessage;

public interface RoomInboxSummaryWriter {

    SummaryWriteResult applyCreated(ChatMessage message);

    SummaryWriteResult applyUpdated(ChatMessage message);

    SummaryWriteResult applyDeleted(ChatMessage message);
}
