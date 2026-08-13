package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionRuleTest {

    @Test
    void providesDocumentedTextAndScaleDefaults() {
        assertThat(ShortTextRule.defaults().maxLength()).isEqualTo(200);
        assertThat(LongTextRule.defaults().maxLength()).isEqualTo(2_000);
        assertThat(ScaleRule.defaults())
                .extracting(ScaleRule::minimum, ScaleRule::maximum)
                .containsExactly(1, 5);
    }

    @Test
    void validatesMultipleChoiceSelectionBounds() {
        assertThat(new MultipleChoiceRule(1, 3).questionType())
                .isEqualTo(SurveyQuestionType.MULTIPLE_CHOICE);

        assertThatThrownBy(() -> new MultipleChoiceRule(0, 2))
                .isInstanceOf(SurveyDomainException.class);
        assertThatThrownBy(() -> new MultipleChoiceRule(3, 2))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void validatesTextLengthLimits() {
        assertThatThrownBy(() -> new ShortTextRule(501))
                .isInstanceOf(SurveyDomainException.class);
        assertThatThrownBy(() -> new LongTextRule(5_001))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void canonicalizesAndValidatesIntegerNumberRule() {
        NumberRule rule = NumberRule.integers(
                new BigDecimal("0.00"),
                new BigDecimal("100.0"));

        assertThat(rule.minimum()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(rule.maximum()).isEqualByComparingTo(new BigDecimal("100"));
        assertThat(rule.decimalScale()).isZero();

        assertThatThrownBy(() -> NumberRule.integers(
                new BigDecimal("0.1"),
                BigDecimal.ONE))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void validatesDecimalNumberRuleAgainstConfiguredScale() {
        NumberRule rule = new NumberRule(
                new BigDecimal("0.00"),
                new BigDecimal("10.25"),
                true,
                2);

        assertThat(rule.maximum()).isEqualByComparingTo("10.25");
        assertThatThrownBy(() -> new NumberRule(
                BigDecimal.ZERO,
                new BigDecimal("10.123"),
                true,
                2))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void allowsOnlyDocumentedScaleRange() {
        assertThat(new ScaleRule(0, 10, "낮음", "높음").minimumLabel())
                .isEqualTo("낮음");
        assertThatThrownBy(() -> new ScaleRule(2, 5, null, null))
                .isInstanceOf(SurveyDomainException.class);
        assertThatThrownBy(() -> new ScaleRule(1, 11, null, null))
                .isInstanceOf(SurveyDomainException.class);
    }
}
