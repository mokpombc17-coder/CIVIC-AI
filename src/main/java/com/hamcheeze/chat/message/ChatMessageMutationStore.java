package com.hamcheeze.chat.message;

public interface ChatMessageMutationStore {

    ChatMessageMutationResult edit(EditChatMessageMutation mutation);

    ChatMessageMutationResult delete(DeleteChatMessageMutation mutation);
}
