package com.hamcheeze.vote.survey.domain.common;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.contentVersionId;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.questionId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyDomainFoundationTest {

    @Test
    void keepsIdentifiersExplicitAndDeterministic() {
        assertThat(contentVersionId().value())
                .isNotEqualTo(questionId().value());
        assertThat(NOW).hasToString("2026-01-01T00:00:00Z");
    }

    @Test
    void rejectsMissingIdentifierWithDomainViolation() {
        assertThatThrownBy(() -> new SurveyRoundId(null))
                .isInstanceOfSatisfying(
                        SurveyDomainException.class,
                        exception -> assertThat(exception.violation())
                                .extracting(
                                        SurveyViolation::code,
                                        SurveyViolation::path)
                                .containsExactly(
                                        "SURVEY_ROUND_ID_REQUIRED",
                                        "roundId"));
    }

    @Test
    void acceptsOnlyPositiveSequenceNumbers() {
        assertThat(new SurveyContentVersionNumber(1).value()).isEqualTo(1);
        assertThat(new SurveyRoundNumber(2))
                .isGreaterThan(new SurveyRoundNumber(1));

        assertThatThrownBy(() -> new SurveyRoundNumber(0))
                .isInstanceOfSatisfying(
                        SurveyDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo("SURVEY_ROUND_NUMBER_INVALID"));
    }

    @Test
    void representsOneInvariantViolationSeparately() {
        SurveyDomainException exception = SurveyDomainException.invariant(
                "SURVEY_STATE_INVALID",
                "status",
                "status does not allow this command");

        assertThat(exception.violation())
                .isEqualTo(SurveyViolation.of(
                        "SURVEY_STATE_INVALID",
                        "status",
                        "status does not allow this command"));
    }

    @Test
    void preservesMultipleValidationViolationsAndDetails() {
        List<SurveyViolation> violations = List.of(
                new SurveyViolation(
                        "SURVEY_TEXT_TOO_LONG",
                        "questions[0].answer",
                        "text is too long",
                        Map.of(
                                "questionId", questionId().value().toString(),
                                "maxLength", "500")),
                SurveyViolation.of(
                        "SURVEY_REQUIRED_ANSWER_MISSING",
                        "questions[1].answer",
                        "answer is required"));

        SurveyValidationException exception =
                new SurveyValidationException(violations);

        assertThat(exception.violations()).containsExactlyElementsOf(violations);
        assertThat(exception.getMessage()).contains("2 violation(s)");
        assertThatThrownBy(() -> exception.violations().add(
                SurveyViolation.of("CODE", "path", "message")))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void refusesAnEmptyValidationFailure() {
        assertThatThrownBy(() -> new SurveyValidationException(List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("violations must not be empty");
    }
}
