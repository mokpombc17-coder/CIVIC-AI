package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.MultipleChoiceValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.NumberValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyAnswer;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyAnswerValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyOption;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.ScaleValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.SingleChoiceValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.TextValue;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class PersonaProviderRequestJson {

    private PersonaProviderRequestJson() {
    }

    static CreatePersonaRequest from(
            PersonaGenerationId generationId,
            int schemaVersion,
            PersonaSurveySource source
    ) {
        return new CreatePersonaRequest(
                generationId.value(), schemaVersion,
                SurveySourcePayload.from(source));
    }

    record CreatePersonaRequest(
            UUID generationId,
            int schemaVersion,
            SurveySourcePayload survey
    ) {
    }

    record SurveySourcePayload(
            UUID responseId,
            UUID roundId,
            int roundNumber,
            UUID contentVersionId,
            int contentVersionNumber,
            Instant submittedAt,
            List<AnswerPayload> answers
    ) {
        static SurveySourcePayload from(PersonaSurveySource source) {
            return new SurveySourcePayload(
                    source.responseId().value(),
                    source.roundId(),
                    source.roundNumber(),
                    source.contentVersionId(),
                    source.contentVersionNumber(),
                    source.submittedAt(),
                    source.answers().stream().map(AnswerPayload::from).toList());
        }
    }

    record AnswerPayload(
            UUID questionId,
            UUID questionLineageId,
            String questionType,
            String prompt,
            String description,
            int displayOrder,
            ValuePayload value
    ) {
        static AnswerPayload from(PersonaSurveyAnswer answer) {
            var question = answer.question();
            return new AnswerPayload(
                    question.questionId(),
                    question.questionLineageId(),
                    question.type().name(),
                    question.prompt(),
                    question.description().orElse(null),
                    question.displayOrder(),
                    ValuePayload.from(answer.value()));
        }
    }

    record ValuePayload(
            String type,
            List<OptionPayload> selectedOptions,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue
    ) {
        static ValuePayload from(PersonaSurveyAnswerValue value) {
            if (value instanceof SingleChoiceValue single) {
                return new ValuePayload(
                        "SINGLE_CHOICE",
                        List.of(OptionPayload.from(single.selectedOption())),
                        null, null, null);
            }
            if (value instanceof MultipleChoiceValue multiple) {
                return new ValuePayload(
                        "MULTIPLE_CHOICE",
                        multiple.selectedOptions().stream()
                                .map(OptionPayload::from).toList(),
                        null, null, null);
            }
            if (value instanceof TextValue text) {
                return new ValuePayload(
                        "TEXT", List.of(), text.value(), null, null);
            }
            if (value instanceof NumberValue number) {
                return new ValuePayload(
                        "NUMBER", List.of(), null, number.value(), null);
            }
            if (value instanceof ScaleValue scale) {
                return new ValuePayload(
                        "SCALE", List.of(), null, null, scale.value());
            }
            throw new IllegalArgumentException(
                    "unsupported persona survey answer value");
        }
    }

    record OptionPayload(
            UUID optionId,
            UUID optionLineageId,
            String kind,
            String label,
            int displayOrder,
            String inputText
    ) {
        static OptionPayload from(PersonaSurveyOption option) {
            return new OptionPayload(
                    option.optionId(),
                    option.optionLineageId(),
                    option.kind().name(),
                    option.label(),
                    option.displayOrder(),
                    option.inputText().orElse(null));
        }
    }
}
