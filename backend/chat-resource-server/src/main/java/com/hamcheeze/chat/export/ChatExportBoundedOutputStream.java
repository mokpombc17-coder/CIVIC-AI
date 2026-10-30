package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Objects;

public final class ChatExportBoundedOutputStream extends FilterOutputStream {

    private final ChatExportWorkspaceBudget workspaceBudget;
    private final long fileLimit;
    private final ChatExportDeadline deadline;
    private long fileBytes;

    public ChatExportBoundedOutputStream(
            OutputStream output,
            ChatExportWorkspaceBudget workspaceBudget,
            long fileLimit,
            ChatExportDeadline deadline
    ) {
        super(Objects.requireNonNull(output, "output"));
        this.workspaceBudget = Objects.requireNonNull(
                workspaceBudget,
                "workspaceBudget");
        if (fileLimit < 1) {
            throw new IllegalArgumentException("fileLimit must be positive");
        }
        this.fileLimit = fileLimit;
        this.deadline = Objects.requireNonNull(deadline, "deadline");
    }

    @Override
    public void write(int value) throws IOException {
        reserve(1);
        out.write(value);
    }

    @Override
    public void write(byte[] bytes, int offset, int length)
            throws IOException {
        Objects.checkFromIndexSize(offset, length, bytes.length);
        reserve(length);
        out.write(bytes, offset, length);
    }

    public long writtenBytes() {
        return fileBytes;
    }

    private void reserve(long bytes) {
        deadline.check();
        final long next;
        try {
            next = Math.addExact(fileBytes, bytes);
        } catch (ArithmeticException exception) {
            throw tooLarge();
        }
        if (next > fileLimit) {
            throw tooLarge();
        }
        workspaceBudget.consume(bytes);
        fileBytes = next;
    }

    private ChatExportException tooLarge() {
        return new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                HttpStatus.PAYLOAD_TOO_LARGE,
                false,
                "Export file size limit exceeded");
    }
}
