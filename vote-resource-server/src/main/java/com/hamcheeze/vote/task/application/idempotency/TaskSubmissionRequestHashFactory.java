package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
import com.hamcheeze.vote.task.domain.submission.UserAnsweredTaskQuestion;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class TaskSubmissionRequestHashFactory {

    private static final String FORMAT_VERSION = "task-submit-v1";

    public TaskRequestHash hash(
            TaskId taskId,
            TaskPredictionId predictionId,
            List<TaskSubmissionAnswerCommand> answers
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(answers, "answers");
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "answers must not contain null");
        }
        List<byte[]> canonicalAnswers = answers.stream()
                .map(this::canonicalAnswer)
                .sorted(Arrays::compareUnsigned)
                .toList();
        return TaskRequestHash.sha256(write(output -> {
            writeString(output, FORMAT_VERSION);
            writeUuid(output, taskId.value());
            writeUuid(output, predictionId.value());
            output.writeInt(canonicalAnswers.size());
            for (byte[] answer : canonicalAnswers) {
                writeBytes(output, answer);
            }
        }));
    }

    private byte[] canonicalAnswer(TaskSubmissionAnswerCommand command) {
        return write(output -> {
            writeUuid(output, command.questionId().value());
            switch (command) {
                case AcceptTaskPredictionCandidate accepted -> {
                    writeString(output, "AI_ACCEPTED");
                    writeUuid(output, accepted.candidateId().value());
                }
                case UserAnsweredTaskQuestion answered -> {
                    writeString(output, "USER_ANSWERED");
                    writeAnswer(output, answered.answerValue());
                }
            }
        });
    }

    private void writeAnswer(
            DataOutputStream output,
            TaskAnswerValue answer
    ) throws IOException {
        writeString(output, answer.questionType().name());
        switch (answer) {
            case SingleChoiceValue single ->
                    writeSelection(output, single.selection());
            case MultipleChoiceValue multiple -> {
                List<byte[]> selections = multiple.selections().stream()
                        .map(this::canonicalSelection)
                        .sorted(Arrays::compareUnsigned)
                        .toList();
                output.writeInt(selections.size());
                for (byte[] selection : selections) {
                    writeBytes(output, selection);
                }
            }
            case ShortTextValue text ->
                    writeString(output, normalizeText(text.value()));
            case LongTextValue text ->
                    writeString(output, normalizeText(text.value()));
            case NumberValue number ->
                    writeString(output, canonicalNumber(number.value()));
            case ScaleValue scale -> output.writeInt(scale.value());
        }
    }

    private byte[] canonicalSelection(TaskOptionSelection selection) {
        return write(output -> writeSelection(output, selection));
    }

    private static void writeSelection(
            DataOutputStream output,
            TaskOptionSelection selection
    ) throws IOException {
        writeUuid(output, selection.optionId().value());
        writeNullableString(output, normalizeText(selection.otherText()));
    }

    private static String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        return value.replace("\r\n", "\n")
                .replace('\r', '\n')
                .strip();
    }

    private static String canonicalNumber(BigDecimal value) {
        if (value.signum() == 0) {
            return "0";
        }
        return value.stripTrailingZeros().toPlainString();
    }

    private static void writeUuid(
            DataOutputStream output,
            UUID value
    ) throws IOException {
        output.writeLong(value.getMostSignificantBits());
        output.writeLong(value.getLeastSignificantBits());
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
        writeBytes(output, value.getBytes(StandardCharsets.UTF_8));
    }

    private static void writeBytes(
            DataOutputStream output,
            byte[] value
    ) throws IOException {
        output.writeInt(value.length);
        output.write(value);
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
