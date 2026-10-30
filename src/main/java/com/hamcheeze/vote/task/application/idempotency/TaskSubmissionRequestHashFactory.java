package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

public final class TaskSubmissionRequestHashFactory {

    private static final String FORMAT_VERSION = "task-submit-v4";

    public TaskRequestHash hash(
            TaskId taskId,
            TaskOptionId selectedOptionId,
            TaskReasonSource reasonSource,
            TaskPredictedReasonId predictedReasonId,
            String reason
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        Objects.requireNonNull(reasonSource, "reasonSource");
        return TaskRequestHash.sha256(write(output -> {
            writeString(output, FORMAT_VERSION);
            writeUuid(output, taskId.value());
            writeUuid(output, selectedOptionId.value());
            switch (reasonSource) {
                case AI_ACCEPTED -> {
                    writeString(output, "AI_ACCEPTED");
                    writeUuid(output, Objects.requireNonNull(
                            predictedReasonId, "predictedReasonId").value());
                }
                case USER_WRITTEN -> {
                    writeString(output, "USER_WRITTEN");
                    writeString(output, normalizeText(
                            Objects.requireNonNull(reason, "reason")));
                }
            }
        }));
    }

    private static String normalizeText(String value) {
        return value.replace("\r\n", "\n")
                .replace('\r', '\n')
                .strip();
    }

    private static void writeUuid(
            DataOutputStream output,
            UUID value
    ) throws IOException {
        output.writeLong(value.getMostSignificantBits());
        output.writeLong(value.getLeastSignificantBits());
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
                    "failed to canonicalize task submission", exception);
        }
    }

    @FunctionalInterface
    private interface IoWriter {
        void write(DataOutputStream output) throws IOException;
    }
}
