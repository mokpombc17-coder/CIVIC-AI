package com.hamcheeze.chat.export;

import java.nio.file.Path;

public record ResearchChatExportTempWorkspace(
        String exportId,
        Path directory,
        Path messagesFile,
        Path changesFile,
        Path transcriptFile,
        Path metadataFile,
        Path artifactPart,
        Path artifactZip
) {
}
