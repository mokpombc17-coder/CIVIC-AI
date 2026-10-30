package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ChatExportJobStore {

    void insertRunning(ChatExportJob job);

    Optional<ChatExportJob> findLatestSucceeded(
            String roomId,
            String requestedByAdminId);

    List<ChatExportJob> findRunning();

    boolean markSucceeded(String exportId, ChatExportCompletion completion);

    boolean markFailed(
            String exportId,
            ChatExportFailureCode failureCode,
            Instant completedAt);
}
