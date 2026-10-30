package com.hamcheeze.chat.export;

import java.nio.file.Path;

public interface AdminRoomConversationExportExecution extends AutoCloseable {

    String exportId();

    Path artifactPath();

    long artifactSizeBytes();

    String artifactSha256();

    boolean markSucceeded();

    void markFailedBestEffort(ChatExportFailureCode failureCode);

    @Override
    void close();
}
