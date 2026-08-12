package com.hamcheeze.chat.export;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@FunctionalInterface
interface ChatExportUsableSpaceReader {

    long usableBytes(Path root) throws IOException;

    static ChatExportUsableSpaceReader fileStore() {
        return root -> Files.getFileStore(root).getUsableSpace();
    }
}
