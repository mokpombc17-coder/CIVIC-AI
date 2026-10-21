package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PersonaGenerationInputSnapshotFactoryAdapterTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-20T03:00:00Z");

    private final PersonaGenerationInputSnapshotFactoryAdapter factory =
            new PersonaGenerationInputSnapshotFactoryAdapter(
                    new ObjectMapper());

    @Test
    void serializesEverySurveyAnswerTypeDeterministicallyIntoExactText() {
        PersonaGenerationId generationId =
                new PersonaGenerationId(uuid(1));
        PersonaSurveySource source = source();

        PersonaGenerationInputSnapshot first = factory.create(
                generationId, source, CREATED_AT);
        PersonaGenerationInputSnapshot second = factory.create(
                generationId, source, CREATED_AT.plusSeconds(1));

        assertThat(second.requestPayload()).isEqualTo(first.requestPayload());
        assertThat(second.requestFingerprint())
                .isEqualTo(first.requestFingerprint());
        assertThat(first.requestFingerprint())
                .isEqualTo(PersonaGenerationInputSnapshot.fingerprint(
                        first.requestPayload()));
        assertThat(first.requestPayload()).containsSubsequence(
                "\"questionId\":\"" + uuid(10) + "\"",
                "\"questionId\":\"" + uuid(20) + "\"",
                "\"questionId\":\"" + uuid(30) + "\"",
                "\"questionId\":\"" + uuid(40) + "\"",
                "\"questionId\":\"" + uuid(50) + "\"",
                "\"questionId\":\"" + uuid(60) + "\"",
                "\"questionId\":\"" + uuid(70) + "\"",
                "\"questionId\":\"" + uuid(80) + "\"");
        assertThat(first.requestPayload())
                .contains("\"description\":null")
                .contains("\"kind\":\"OTHER\"")
                .contains("\"inputText\":\"직접 입력\"")
                .contains("\"numberValue\":123.45")
                .contains("\"scaleValue\":7")
                .contains("\"type\":\"MATRIX_SINGLE_CHOICE\"")
                .contains("\"type\":\"MATRIX_SCALE\"")
                .contains("\"itemId\":\"" + uuid(201) + "\"")
                .contains("\"itemId\":\"" + uuid(211) + "\"")
                .contains("\"roundNumber\":7")
                .contains("\"contentVersionNumber\":9")
                .contains("\"submittedAt\":\"2026-08-20T02:00:00Z\"");
    }

    @Test
    void serializesUnansweredQuestionAsNullValueWithSchemaVersionThree() {
        var standard = new PersonaSurveySource.PersonaSurveyOption(
                uuid(101), uuid(102),
                PersonaSurveySource.OptionKind.STANDARD,
                "표준", 1, Optional.empty());
        PersonaSurveySource source = new PersonaSurveySource(
                new PersonaSourceId(uuid(2)),
                new PersonaUserId("user-a"),
                uuid(3), 7, uuid(4), 9,
                Instant.parse("2026-08-20T02:00:00Z"),
                List.of(
                        answer(10, PersonaSurveySource.QuestionType
                                        .SINGLE_CHOICE,
                                new PersonaSurveySource.SingleChoiceValue(
                                        standard), Optional.empty()),
                        answer(20, PersonaSurveySource.QuestionType
                                        .SINGLE_CHOICE,
                                null, Optional.empty())));

        PersonaGenerationInputSnapshot snapshot = factory.create(
                new PersonaGenerationId(uuid(1)), source, CREATED_AT);

        assertThat(snapshot.requestSchemaVersion()).isEqualTo(3);
        assertThat(snapshot.requestPayload())
                .contains("\"schemaVersion\":3")
                .containsSubsequence(
                        "\"questionId\":\"" + uuid(20) + "\"",
                        "\"value\":null");
    }

    private static PersonaSurveySource source() {
        var standard = new PersonaSurveySource.PersonaSurveyOption(
                uuid(101), uuid(102),
                PersonaSurveySource.OptionKind.STANDARD,
                "표준", 1, Optional.empty());
        var other = new PersonaSurveySource.PersonaSurveyOption(
                uuid(103), uuid(104),
                PersonaSurveySource.OptionKind.OTHER,
                "기타", 2, Optional.of("직접 입력"));
        var choiceItem = new PersonaSurveySource.PersonaSurveyQuestionItem(
                uuid(201), uuid(202), "choice-item", "선택 항목", 1);
        var scaleItem = new PersonaSurveySource.PersonaSurveyQuestionItem(
                uuid(211), uuid(212), "scale-item", "척도 항목", 1);
        return new PersonaSurveySource(
                new PersonaSourceId(uuid(2)),
                new PersonaUserId("user-a"),
                uuid(3), 7, uuid(4), 9,
                Instant.parse("2026-08-20T02:00:00Z"),
                List.of(
                        answer(10, PersonaSurveySource.QuestionType
                                        .SINGLE_CHOICE,
                                new PersonaSurveySource.SingleChoiceValue(
                                        standard), Optional.of("단일")),
                        answer(20, PersonaSurveySource.QuestionType
                                        .MULTIPLE_CHOICE,
                                new PersonaSurveySource.MultipleChoiceValue(
                                        List.of(standard, other)),
                                Optional.of("복수")),
                        answer(30, PersonaSurveySource.QuestionType.SHORT_TEXT,
                                new PersonaSurveySource.TextValue("짧은 답"),
                                Optional.empty()),
                        answer(40, PersonaSurveySource.QuestionType.LONG_TEXT,
                                new PersonaSurveySource.TextValue("긴 답변"),
                                Optional.of("장문")),
                        answer(50, PersonaSurveySource.QuestionType.NUMBER,
                                new PersonaSurveySource.NumberValue(
                                        new BigDecimal("123.45")),
                                Optional.empty()),
                        answer(60, PersonaSurveySource.QuestionType.SCALE,
                                new PersonaSurveySource.ScaleValue(7),
                                Optional.of("척도")),
                        answer(70, PersonaSurveySource.QuestionType
                                        .MATRIX_SINGLE_CHOICE,
                                new PersonaSurveySource
                                        .MatrixSingleChoiceValue(List.of(
                                        new PersonaSurveySource
                                                .MatrixSingleChoiceItemValue(
                                                choiceItem.itemId(), standard))),
                                Optional.of("행렬 단일 선택"),
                                List.of(choiceItem)),
                        answer(80, PersonaSurveySource.QuestionType
                                        .MATRIX_SCALE,
                                new PersonaSurveySource.MatrixScaleValue(
                                        List.of(new PersonaSurveySource
                                                .MatrixScaleItemValue(
                                                scaleItem.itemId(), 9))),
                                Optional.of("행렬 척도"),
                                List.of(scaleItem))));
    }

    private static PersonaSurveySource.PersonaSurveyAnswer answer(
            long id,
            PersonaSurveySource.QuestionType type,
            PersonaSurveySource.PersonaSurveyAnswerValue value,
            Optional<String> description
    ) {
        return answer(id, type, value, description, List.of());
    }

    private static PersonaSurveySource.PersonaSurveyAnswer answer(
            long id,
            PersonaSurveySource.QuestionType type,
            PersonaSurveySource.PersonaSurveyAnswerValue value,
            Optional<String> description,
            List<PersonaSurveySource.PersonaSurveyQuestionItem> items
    ) {
        return new PersonaSurveySource.PersonaSurveyAnswer(
                new PersonaSurveySource.PersonaSurveyQuestion(
                        uuid(id), uuid(id + 1), type,
                        "질문-" + id, description, (int) (id / 10), items),
                Optional.ofNullable(value));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13100000-0000-0000-0000-%012d".formatted(suffix));
    }
}
