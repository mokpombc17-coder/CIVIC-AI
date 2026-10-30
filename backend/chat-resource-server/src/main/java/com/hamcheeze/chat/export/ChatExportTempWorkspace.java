package com.hamcheeze.chat.export;

import java.nio.file.Path;

public record ChatExportTempWorkspace(
        String exportId,
        Path directory,
        Path roomFile,
        Path participantsFile,
        Path eventsFile,
        Path htmlFile,
        Path manifestFile,
        Path artifactPart,
        Path artifactZip
) {
}
