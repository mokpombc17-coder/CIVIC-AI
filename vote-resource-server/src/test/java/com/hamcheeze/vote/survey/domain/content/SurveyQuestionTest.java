package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.optionId;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.optionLineageKey;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.questionId;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.questionLineageKey;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyQuestionTest {

    @Test
    void createsChoiceQuestionWithMaterializedOtherOption() {
        SurveyQuestion question = SurveyQuestion.choice(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.SINGLE_CHOICE,
                "가장 편한 소통 방식은 무엇인가요?",
                null,
                1,
                true,
                new SingleChoiceRule(),
                List.of(
                        standardOption(1),
                        standardOption(2)),
                true,
                () -> optionId(3),
                () -> optionLineageKey(3));

        assertThat(question.options()).hasSize(3);
        assertThat(question.options().getLast().kind())
                .isEqualTo(SurveyOptionKind.OTHER);
        assertThat(question.options().getLast().label())
                .isEqualTo("기타");
    }

    @Test
    void createsEveryInitiallySupportedQuestionType() {
        List<SurveyQuestion> questions = List.of(
                SurveyQuestion.choice(
                        questionIdFor(1), questionLineageKeyFor(1),
                        SurveyQuestionType.SINGLE_CHOICE, "단일", null,
                        1, true, new SingleChoiceRule(),
                        List.of(standardOption(1), standardOption(2)),
                        false, null, null),
                SurveyQuestion.choice(
                        questionIdFor(2), questionLineageKeyFor(2),
                        SurveyQuestionType.MULTIPLE_CHOICE, "복수", null,
                        2, true, new MultipleChoiceRule(1, 2),
                        List.of(standardOption(3), standardOption(4)),
                        false, null, null),
                textQuestion(
                        3, SurveyQuestionType.SHORT_TEXT,
                        ShortTextRule.defaults()),
                textQuestion(
                        4, SurveyQuestionType.LONG_TEXT,
                        LongTextRule.defaults()),
                textQuestion(
                        5, SurveyQuestionType.NUMBER,
                        NumberRule.integers(
                                BigDecimal.ZERO,
                                new BigDecimal("100"))),
                textQuestion(
                        6, SurveyQuestionType.SCALE,
                        ScaleRule.defaults()));

        assertThat(questions)
                .extracting(SurveyQuestion::type)
                .containsExactly(SurveyQuestionType.values());
    }

    @Test
    void rejectsQuestionAndRuleTypeMismatch() {
        assertThatThrownBy(() -> new SurveyQuestion(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                true,
                new LongTextRule(100),
                List.of()))
                .isInstanceOf(SurveyDomainException.class)
                .hasMessageContaining("must match");
    }

    @Test
    void rejectsOptionalQuestion() {
        assertThatThrownBy(() -> new SurveyQuestion(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                false,
                ShortTextRule.defaults(),
                List.of()))
                .isInstanceOf(SurveyDomainException.class)
                .hasMessageContaining("must be required");
    }

    @Test
    void rejectsOptionsForNonChoiceQuestion() {
        assertThatThrownBy(() -> new SurveyQuestion(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of(standardOption(1))))
                .isInstanceOf(SurveyValidationException.class);
    }

    @Test
    void rejectsOtherOptionThatIsNotLast() {
        assertThatThrownBy(() -> new SurveyQuestion(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.MULTIPLE_CHOICE,
                "질문",
                null,
                1,
                true,
                new MultipleChoiceRule(1, 2),
                List.of(
                        SurveyOption.other(
                                optionId(1),
                                optionLineageKey(1),
                                1),
                        standardOption(2))))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .contains("SURVEY_OTHER_OPTION_NOT_LAST"));
    }

    @Test
    void rejectsDuplicateOptionStructureTogether() {
        SurveyOption duplicated = standardOption(1);

        assertThatThrownBy(() -> new SurveyQuestion(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.SINGLE_CHOICE,
                "질문",
                null,
                1,
                true,
                new SingleChoiceRule(),
                List.of(duplicated, duplicated)))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .hasSize(4));
    }

    @Test
    void countsQuestionPromptByUnicodeCodePoint() {
        String emojiPrompt = "😀".repeat(500);

        SurveyQuestion question = new SurveyQuestion(
                questionId(),
                questionLineageKey(),
                SurveyQuestionType.SHORT_TEXT,
                emojiPrompt,
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());

        assertThat(question.prompt().codePointCount(
                0,
                question.prompt().length())).isEqualTo(500);
    }

    private static SurveyOption standardOption(int sequence) {
        return SurveyOption.standard(
                optionId(sequence),
                optionLineageKey(sequence),
                "선택지 " + sequence,
                sequence);
    }

    private static SurveyQuestion textQuestion(
            int sequence,
            SurveyQuestionType type,
            QuestionRule rule
    ) {
        return new SurveyQuestion(
                questionIdFor(sequence),
                questionLineageKeyFor(sequence),
                type,
                "질문 " + sequence,
                null,
                sequence,
                true,
                rule,
                List.of());
    }

    private static SurveyQuestionId questionIdFor(int sequence) {
        return new SurveyQuestionId(new UUID(3, sequence));
    }

    private static com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey
            questionLineageKeyFor(int sequence) {
        return new com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey(
                new UUID(4, sequence));
    }

    private static SurveyOptionId optionId(int sequence) {
        return new SurveyOptionId(new UUID(1, sequence));
    }

    private static SurveyOptionLineageKey optionLineageKey(int sequence) {
        return new SurveyOptionLineageKey(new UUID(2, sequence));
    }
}
