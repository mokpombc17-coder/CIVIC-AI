package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import static com.hamcheeze.vote.persona.application.PersonaSurveySource.MultipleChoiceValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.NumberValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyAnswer;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyAnswerValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyOption;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyQuestion;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.ScaleValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.SingleChoiceValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.TextValue;

@Component
public final class PersonaSurveySourceAssembler {

    public PersonaSurveySource assemble(
            SurveyResponse response,
            SurveyRound round,
            SurveyContentVersion content
    ) {
        Objects.requireNonNull(response, "response");
        Objects.requireNonNull(round, "round");
        Objects.requireNonNull(content, "content");
        validateRelations(response, round, content);

        SurveyContentVersionNumber versionNumber = content.versionNumber()
                .orElseThrow(() -> violation(
                        response,
                        "referenced content has no published version number"));
        Map<SurveyQuestionId, SurveyQuestion> questions = new HashMap<>();
        content.questions().forEach(question ->
                questions.put(question.id(), question));

        List<PersonaSurveyAnswer> answers = new ArrayList<>();
        for (SurveyAnswer answer : response.answers()) {
            SurveyQuestion question = questions.get(answer.questionId());
            if (question == null) {
                throw violation(response,
                        "answer references a question outside content: "
                                + answer.questionId());
            }
            if (!question.type().name().equals(answer.answerType().name())) {
                throw violation(response,
                        "answer type does not match question type: "
                                + answer.questionId());
            }
            answers.add(new PersonaSurveyAnswer(
                    toQuestion(question),
                    toValue(response, question, answer)));
        }
        answers.sort(Comparator.comparingInt(
                answer -> answer.question().displayOrder()));

        return new PersonaSurveySource(
                response.id(),
                response.userId(),
                response.roundId(),
                response.roundNumber(),
                response.contentVersionId(),
                versionNumber,
                response.submittedAt(),
                answers);
    }

    private static void validateRelations(
            SurveyResponse response,
            SurveyRound round,
            SurveyContentVersion content
    ) {
        if (!response.roundId().equals(round.id())) {
            throw violation(response,
                    "response roundId does not match round");
        }
        if (!response.roundNumber().equals(round.roundNumber())) {
            throw violation(response,
                    "response roundNumber does not match round");
        }
        if (!response.contentVersionId().equals(round.contentVersionId())) {
            throw violation(response,
                    "response contentVersionId does not match round");
        }
        if (!response.contentVersionId().equals(content.id())) {
            throw violation(response,
                    "response contentVersionId does not match content");
        }
        if (content.status() != SurveyContentVersionStatus.PUBLISHED) {
            throw violation(response,
                    "response content version is not published");
        }
    }

    private static PersonaSurveyQuestion toQuestion(
            SurveyQuestion question
    ) {
        return new PersonaSurveyQuestion(
                question.id(),
                question.lineageKey(),
                question.type(),
                question.prompt(),
                Optional.ofNullable(question.description()),
                question.displayOrder());
    }

    private static PersonaSurveyAnswerValue toValue(
            SurveyResponse response,
            SurveyQuestion question,
            SurveyAnswer answer
    ) {
        return switch (answer) {
            case SingleChoiceAnswer single -> new SingleChoiceValue(
                    toOption(response, question, single.selection()));
            case MultipleChoiceAnswer multiple -> {
                List<PersonaSurveyOption> selected = multiple.selections()
                        .stream()
                        .map(selection -> toOption(
                                response, question, selection))
                        .sorted(Comparator.comparingInt(
                                PersonaSurveyOption::displayOrder))
                        .toList();
                if (selected.isEmpty()) {
                    throw violation(response,
                            "multiple choice answer has no selection: "
                                    + question.id());
                }
                yield new MultipleChoiceValue(selected);
            }
            case ShortTextAnswer text -> new TextValue(requireValue(
                    response, question, text.value(), "text"));
            case LongTextAnswer text -> new TextValue(requireValue(
                    response, question, text.value(), "text"));
            case NumberAnswer number -> new NumberValue(requireValue(
                    response, question, number.value(), "number"));
            case ScaleAnswer scale -> new ScaleValue(requireValue(
                    response, question, scale.value(), "scale"));
        };
    }

    private static PersonaSurveyOption toOption(
            SurveyResponse response,
            SurveyQuestion question,
            OptionSelection selection
    ) {
        SurveyOption option = findOption(question, selection.optionId())
                .orElseThrow(() -> violation(
                        response,
                        "answer references an option outside question: "
                                + selection.optionId()));
        Optional<String> inputText = selection.optionalInputText();
        if (option.kind() == SurveyOptionKind.STANDARD
                && inputText.isPresent()) {
            throw violation(response,
                    "STANDARD option contains input text: " + option.id());
        }
        if (option.kind() == SurveyOptionKind.OTHER) {
            String value = inputText
                    .filter(text -> !text.isBlank())
                    .orElseThrow(() -> violation(
                            response,
                            "OTHER option has no input text: "
                                    + option.id()));
            if (!value.equals(value.strip())) {
                throw violation(response,
                        "OTHER option input text is not normalized: "
                                + option.id());
            }
        }
        return new PersonaSurveyOption(
                option.id(),
                option.lineageKey(),
                option.kind(),
                option.label(),
                option.displayOrder(),
                inputText);
    }

    private static Optional<SurveyOption> findOption(
            SurveyQuestion question,
            SurveyOptionId optionId
    ) {
        return question.options().stream()
                .filter(option -> option.id().equals(optionId))
                .findFirst();
    }

    private static <T> T requireValue(
            SurveyResponse response,
            SurveyQuestion question,
            T value,
            String kind
    ) {
        if (value == null) {
            throw violation(response,
                    kind + " answer has no value: " + question.id());
        }
        return value;
    }

    private static PersonaSurveySourceException violation(
            SurveyResponse response,
            String detail
    ) {
        return PersonaSurveySourceException.integrityViolation(
                response.id(), detail);
    }
}
