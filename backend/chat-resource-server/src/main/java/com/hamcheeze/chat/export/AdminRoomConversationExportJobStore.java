package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.List;

public interface AdminRoomConversationExportJobStore {

    void insertRunning(AdminRoomConversationExportJob job);

    List<AdminRoomConversationExportJob> findRunning();

    boolean markSucceeded(
            String exportId,
            AdminRoomConversationExportCompletion completion);

    boolean markFailed(
            String exportId,
            ChatExportFailureCode failureCode,
            Instant completedAt);
}
