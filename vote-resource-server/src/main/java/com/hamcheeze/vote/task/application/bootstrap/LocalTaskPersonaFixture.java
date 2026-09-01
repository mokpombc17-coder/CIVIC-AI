package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyFixture;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.MatrixScaleRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
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

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Local-only Survey answers used to prepare the frontend Task user's Persona. */
public final class LocalTaskPersonaFixture {

    public static final String DEFAULT_USER_SUBJECT = "local-user-1";
    public static final String SURVEY_IDEMPOTENCY_KEY = UUID.nameUUIDFromBytes(
            "vote-local-task-persona-survey-v1".getBytes(
                    StandardCharsets.UTF_8)).toString();

    private static final String SHORT_TEXT =
            "근거를 비교한 뒤 결정합니다.";
    private static final String LONG_TEXT =
            "여러 관점과 근거를 비교한 뒤 실행 가능한 결론을 정리합니다.";

    private LocalTaskPersonaFixture() {
    }

    public static List<SurveyAnswer> answers() {
        return LocalSurveyFixture.questions().stream()
                .map(LocalTaskPersonaFixture::answer)
                .toList();
    }

    private static SurveyAnswer answer(SurveyQuestion question) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> new SingleChoiceAnswer(
                    question.id(), selection(standardOptions(question).getFirst()));
            case MULTIPLE_CHOICE -> {
                MultipleChoiceRule rule =
                        (MultipleChoiceRule) question.rule();
                List<OptionSelection> selections = standardOptions(question)
                        .stream()
                        .limit(rule.minimumSelections())
                        .map(LocalTaskPersonaFixture::selection)
                        .toList();
                yield new MultipleChoiceAnswer(question.id(), selections);
            }
            case SCALE -> new ScaleAnswer(
                    question.id(), ((ScaleRule) question.rule()).minimum());
            case NUMBER -> new NumberAnswer(
                    question.id(), ((NumberRule) question.rule()).minimum());
            case SHORT_TEXT -> new ShortTextAnswer(
                    question.id(), SHORT_TEXT);
            case LONG_TEXT -> new LongTextAnswer(
                    question.id(), LONG_TEXT);
            case MATRIX_SINGLE_CHOICE -> new MatrixSingleChoiceAnswer(
                    question.id(),
                    question.items().stream()
                            .map(item -> new MatrixSingleChoiceItemAnswer(
                                    item.id(),
                                    selection(standardOptions(question)
                                            .getFirst())))
                            .toList());
            case MATRIX_SCALE -> new MatrixScaleAnswer(
                    question.id(),
                    question.items().stream()
                            .map(item -> new MatrixScaleItemAnswer(
                                    item.id(),
                                    ((MatrixScaleRule) question.rule())
                                            .minimum()))
                            .toList());
        };
    }

    private static List<SurveyOption> standardOptions(
            SurveyQuestion question
    ) {
        return question.options().stream()
                .filter(option -> option.kind() == SurveyOptionKind.STANDARD)
                .toList();
    }

    private static OptionSelection selection(SurveyOption option) {
        return new OptionSelection(option.id(), null);
    }
}
