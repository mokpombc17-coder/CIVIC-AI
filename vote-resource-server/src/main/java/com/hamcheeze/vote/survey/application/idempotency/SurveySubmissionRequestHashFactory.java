package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class SurveySubmissionRequestHashFactory {

    private static final String FORMAT_VERSION = "survey-submit-v2";

    public SurveyRequestHash hash(
            SurveyRoundId roundId,
            List<SurveyAnswer> answers
    ) {
        Objects.requireNonNull(roundId, "roundId");
        Objects.requireNonNull(answers, "answers");
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "answers must not contain null");
        }

        List<byte[]> canonicalAnswers = answers.stream()
                .map(this::canonicalAnswer)
                .sorted(Arrays::compareUnsigned)
                .toList();
        return SurveyRequestHash.sha256(write(output -> {
            writeString(output, FORMAT_VERSION);
            writeUuid(output, roundId.value());
            output.writeInt(canonicalAnswers.size());
            for (byte[] answer : canonicalAnswers) {
                writeBytes(output, answer);
            }
        }));
    }

    private byte[] canonicalAnswer(SurveyAnswer answer) {
        return write(output -> {
            writeString(output, answer.answerType().name());
            writeUuid(output, answer.questionId().value());
            switch (answer) {
                case SingleChoiceAnswer single ->
                        writeSelection(output, single.selection());
                case MultipleChoiceAnswer multiple -> {
                    List<byte[]> selections = multiple.selections().stream()
                            .map(this::canonicalSelection)
                            .sorted(Arrays::compareUnsigned)
                            .toList();
                    output.writeInt(selections.size());
                    for (byte[] selection : selections) {
                        writeBytes(output, selection);
                    }
                }
                case ShortTextAnswer text ->
                        writeNullableString(output, normalizeText(text.value()));
                case LongTextAnswer text ->
                        writeNullableString(output, normalizeText(text.value()));
                case NumberAnswer number ->
                        writeNullableString(output, canonicalNumber(number.value()));
                case ScaleAnswer scale ->
                        writeNullableInteger(output, scale.value());
                case MatrixSingleChoiceAnswer matrix -> {
                    List<byte[]> itemAnswers = matrix.itemAnswers().stream()
                            .map(this::canonicalMatrixSelection)
                            .sorted(Arrays::compareUnsigned)
                            .toList();
                    output.writeInt(itemAnswers.size());
                    for (byte[] itemAnswer : itemAnswers) {
                        writeBytes(output, itemAnswer);
                    }
                }
                case MatrixScaleAnswer matrix -> {
                    List<byte[]> itemAnswers = matrix.itemAnswers().stream()
                            .map(this::canonicalMatrixScale)
                            .sorted(Arrays::compareUnsigned)
                            .toList();
                    output.writeInt(itemAnswers.size());
                    for (byte[] itemAnswer : itemAnswers) {
                        writeBytes(output, itemAnswer);
                    }
                }
            }
        });
    }

    private byte[] canonicalMatrixSelection(
            MatrixSingleChoiceItemAnswer itemAnswer
    ) {
        return write(output -> {
            writeUuid(output, itemAnswer.itemId().value());
            writeSelection(output, itemAnswer.selection());
        });
    }

    private byte[] canonicalMatrixScale(MatrixScaleItemAnswer itemAnswer) {
        return write(output -> {
            writeUuid(output, itemAnswer.itemId().value());
            writeNullableInteger(output, itemAnswer.value());
        });
    }

    private byte[] canonicalSelection(OptionSelection selection) {
        return write(output -> writeSelection(output, selection));
    }

    private static void writeSelection(
            DataOutputStream output,
            OptionSelection selection
    ) throws IOException {
        writeUuid(output, selection.optionId().value());
        writeNullableString(
                output,
                normalizeText(selection.inputText()));
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
        if (value == null) {
            return null;
        }
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

    private static void writeNullableInteger(
            DataOutputStream output,
            Integer value
    ) throws IOException {
        output.writeBoolean(value != null);
        if (value != null) {
            output.writeInt(value);
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
                    "failed to canonicalize survey submission", exception);
        }
    }

    @FunctionalInterface
    private interface IoWriter {

        void write(DataOutputStream output) throws IOException;
    }
}
