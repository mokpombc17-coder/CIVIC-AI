package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.idempotency.TaskRequestHash;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

final class TaskAdminCreateRequestHashFactory {

    private static final String FORMAT_VERSION = "task-admin-create-v1";

    TaskRequestHash hash(TaskApiModels.TaskWriteRequest request) {
        return TaskRequestHash.sha256(write(output -> {
            writeString(output, FORMAT_VERSION);
            writeString(output, request.title());
            writeNullableString(output, request.description());
            TaskApiModels.QuestionWriteRequest question = request.question();
            output.writeBoolean(question != null);
            if (question == null) {
                return;
            }
            writeNullableUuid(output, question.id());
            writeString(output, question.content());
            writeNullableString(output, question.description());
            List<TaskApiModels.OptionWriteRequest> options =
                    question.options();
            output.writeInt(options.size());
            for (TaskApiModels.OptionWriteRequest option : options) {
                writeNullableUuid(output, option.id());
                writeString(output, option.content());
            }
        }));
    }

    private static void writeNullableUuid(
            DataOutputStream output,
            UUID value
    ) throws IOException {
        output.writeBoolean(value != null);
        if (value != null) {
            output.writeLong(value.getMostSignificantBits());
            output.writeLong(value.getLeastSignificantBits());
        }
    }

    private static void writeNullableString(
            DataOutputStream output,
            String value
    ) throws IOException {
        output.writeBoolean(value != null);
        if (value != null) {
            writeString(output, value);
        }
    }

    private static void writeString(
            DataOutputStream output,
            String value
    ) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        output.writeInt(bytes.length);
        output.write(bytes);
    }

    private static byte[] write(IoWriter writer) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                writer.write(output);
            }
            return bytes.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "failed to canonicalize Task admin creation", exception);
        }
    }

    @FunctionalInterface
    private interface IoWriter {
        void write(DataOutputStream output) throws IOException;
    }
}
