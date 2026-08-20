package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictedReason;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

public final class TaskSubmissionRequestHashFactory {

    private static final String FORMAT_VERSION = "task-submit-v3";

    public TaskRequestHash hash(
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPredictionId predictionId,
            TaskSubmissionAnswerCommand answer
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(answer, "answer");
        return TaskRequestHash.sha256(write(output -> {
            writeString(output, FORMAT_VERSION);
            writeUuid(output, taskId.value());
            writeNullableUuid(output, personaGenerationId == null
                    ? null : personaGenerationId.value());
            writeNullableUuid(output, personaVersionId == null
                    ? null : personaVersionId.value());
            writeNullableUuid(output, predictionId == null
                    ? null : predictionId.value());
            writeUuid(output, answer.questionId().value());
            writeUuid(output, answer.selectedOptionId().value());
            switch (answer) {
                case AcceptTaskPredictedReason accepted -> {
                    writeString(output, "AI_ACCEPTED");
                    writeUuid(output, accepted.predictedReasonId().value());
                }
                case WriteTaskReason written -> {
                    writeString(output, "USER_WRITTEN");
                    writeString(output, normalizeText(written.reason()));
                }
            }
        }));
    }

    public TaskRequestHash hash(
            TaskId taskId,
            TaskPredictionId predictionId,
            TaskSubmissionAnswerCommand answer
    ) {
        return hash(taskId, null, null, predictionId, answer);
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

    private static void writeNullableUuid(
            DataOutputStream output,
            UUID value
    ) throws IOException {
        output.writeBoolean(value != null);
        if (value != null) {
            writeUuid(output, value);
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
                    "failed to canonicalize task submission", exception);
        }
    }

    @FunctionalInterface
    private interface IoWriter {
        void write(DataOutputStream output) throws IOException;
    }
}
