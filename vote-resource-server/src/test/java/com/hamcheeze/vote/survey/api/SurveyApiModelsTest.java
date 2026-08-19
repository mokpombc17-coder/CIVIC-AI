package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyApiModelsTest {

    @Test
    void defaultsOmittedRequiredToTrue() {
        SurveyQuestion question = questionRequest(null).toDomain();

        assertThat(question.required()).isTrue();
        assertThat(SurveyApiModels.QuestionResponse.from(question).required())
                .isTrue();
    }

    @Test
    void rejectsExplicitOptionalQuestion() {
        assertThatThrownBy(() -> questionRequest(false).toDomain())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("required must be true");
    }

    private SurveyApiModels.QuestionWriteRequest questionRequest(
            Boolean required
    ) {
        return new SurveyApiModels.QuestionWriteRequest(
                null,
                null,
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                required,
                new SurveyApiModels.RuleRequest(
                        null, null, 200, null, null,
                        null, null, null, null),
                false,
                List.of());
    }
}
