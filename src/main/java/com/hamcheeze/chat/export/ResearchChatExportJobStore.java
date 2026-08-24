package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.List;

public interface ResearchChatExportJobStore {

    void insertRunning(ResearchChatExportJob job);

    List<ResearchChatExportJob> findRunning();

    boolean markSucceeded(
            String exportId,
            ResearchChatExportCompletion completion);

    boolean markFailed(
            String exportId,
            ChatExportFailureCode failureCode,
            Instant completedAt);
}
