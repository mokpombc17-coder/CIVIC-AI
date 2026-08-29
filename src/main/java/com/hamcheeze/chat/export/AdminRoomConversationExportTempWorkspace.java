package com.hamcheeze.chat.export;

import java.nio.file.Path;

public record AdminRoomConversationExportTempWorkspace(
        String exportId,
        Path directory,
        Path messagesFile,
        Path changesFile,
        Path transcriptFile,
        Path manifestFile,
        Path artifactPart,
        Path artifactZip
) {
}
