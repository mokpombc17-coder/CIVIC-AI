package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.content.LongTextRule;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.QuestionRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionGroup;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionSection;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswerType;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

final class SurveyApiModels {

    private SurveyApiModels() {
    }

    record ContentWriteRequest(
            @NotBlank String name,
            String description,
            @NotEmpty List<@Valid QuestionWriteRequest> questions
    ) {
        List<SurveyQuestion> toQuestions() {
            return questions.stream()
                    .map(QuestionWriteRequest::toDomain)
                    .toList();
        }
    }

    record QuestionWriteRequest(
            UUID id,
            UUID lineageKey,
            @NotNull SurveyQuestionType type,
            @NotBlank String prompt,
            String description,
            @Positive int displayOrder,
            Boolean required,
            @NotNull @Valid RuleRequest rule,
            boolean allowOther,
            List<@Valid OptionWriteRequest> options
    ) {
        SurveyQuestion toDomain() {
            List<SurveyOption> mappedOptions = options == null
                    ? List.of()
                    : options.stream().map(OptionWriteRequest::toDomain)
                    .toList();
            if (type.isChoice()) {
                List<SurveyOption> standardOptions = mappedOptions.stream()
                        .filter(option -> option.kind()
                                == SurveyOptionKind.STANDARD)
                        .toList();
                SurveyOption otherOption = mappedOptions.stream()
                        .filter(option -> option.kind()
                                == SurveyOptionKind.OTHER)
                        .findFirst()
                        .orElse(null);
                return SurveyQuestion.choice(
                        new SurveyQuestionId(idOrRandom(id)),
                        new SurveyQuestionLineageKey(idOrRandom(lineageKey)),
                        type,
                        prompt,
                        description,
                        displayOrder,
                        requiredOrDefault(),
                        rule.toDomain(type),
                        standardOptions,
                        allowOther || otherOption != null,
                        () -> otherOption == null
                                ? new SurveyOptionId(UUID.randomUUID())
                                : otherOption.id(),
                        () -> otherOption == null
                                ? new SurveyOptionLineageKey(UUID.randomUUID())
                                : otherOption.lineageKey());
            }
            return new SurveyQuestion(
                    new SurveyQuestionId(idOrRandom(id)),
                    new SurveyQuestionLineageKey(idOrRandom(lineageKey)),
                    type,
                    prompt,
                    description,
                    displayOrder,
                    requiredOrDefault(),
                    rule.toDomain(type),
                    mappedOptions);
        }

        private boolean requiredOrDefault() {
            if (Boolean.FALSE.equals(required)) {
                throw new IllegalArgumentException(
                        "required must be true for every survey question");
            }
            return true;
        }
    }

    record OptionWriteRequest(
            UUID id,
            UUID lineageKey,
            String optionLocalKey,
            SurveyOptionKind kind,
            String label,
            @Positive int displayOrder
    ) {
        SurveyOption toDomain() {
            SurveyOptionKind resolvedKind = kind == null
                    ? SurveyOptionKind.STANDARD : kind;
            return new SurveyOption(
                    new SurveyOptionId(idOrRandom(id)),
                    new SurveyOptionLineageKey(idOrRandom(lineageKey)),
                    optionLocalKey == null
                            ? SurveyOption.localKeyForDisplayOrder(displayOrder)
                            : optionLocalKey,
                    resolvedKind,
                    resolvedKind == SurveyOptionKind.OTHER
                            ? SurveyOption.OTHER_LABEL : label,
                    displayOrder);
        }
    }

    record RuleRequest(
            Integer minimumSelections,
            Integer maximumSelections,
            Integer maxLength,
            BigDecimal minimum,
            BigDecimal maximum,
            Boolean decimalAllowed,
            Integer decimalScale,
            String minimumLabel,
            String maximumLabel
    ) {
        QuestionRule toDomain(SurveyQuestionType type) {
            return switch (type) {
                case SINGLE_CHOICE -> new SingleChoiceRule();
                case MULTIPLE_CHOICE -> new MultipleChoiceRule(
                        required(minimumSelections, "minimumSelections"),
                        required(maximumSelections, "maximumSelections"));
                case SHORT_TEXT -> new ShortTextRule(
                        required(maxLength, "maxLength"));
                case LONG_TEXT -> new LongTextRule(
                        required(maxLength, "maxLength"));
                case NUMBER -> new NumberRule(
                        required(minimum, "minimum"),
                        required(maximum, "maximum"),
                        required(decimalAllowed, "decimalAllowed"),
                        required(decimalScale, "decimalScale"));
                case SCALE -> new ScaleRule(
                        required(minimum, "minimum").intValueExact(),
                        required(maximum, "maximum").intValueExact(),
                        minimumLabel,
                        maximumLabel);
            };
        }
    }

    record SubmitResponseRequest(
            @NotNull UUID roundId,
            @NotNull List<@Valid AnswerRequest> answers
    ) {
        List<SurveyAnswer> toAnswers() {
            return answers.stream().map(AnswerRequest::toDomain).toList();
        }
    }

    record AnswerRequest(
            @NotNull UUID questionId,
            @NotNull SurveyAnswerType type,
            String text,
            BigDecimal number,
            Integer scale,
            SelectionRequest selection,
            List<@Valid SelectionRequest> selections
    ) {
        SurveyAnswer toDomain() {
            SurveyQuestionId id = new SurveyQuestionId(questionId);
            return switch (type) {
                case SINGLE_CHOICE -> new SingleChoiceAnswer(
                        id, required(selection, "selection").toDomain());
                case MULTIPLE_CHOICE -> new MultipleChoiceAnswer(
                        id,
                        required(selections, "selections").stream()
                                .map(SelectionRequest::toDomain).toList());
                case SHORT_TEXT -> new ShortTextAnswer(id, text);
                case LONG_TEXT -> new LongTextAnswer(id, text);
                case NUMBER -> new NumberAnswer(id, number);
                case SCALE -> new ScaleAnswer(id, scale);
            };
        }
    }

    record SelectionRequest(
            @NotNull UUID optionId,
            String inputText
    ) {
        OptionSelection toDomain() {
            return new OptionSelection(
                    new SurveyOptionId(optionId), inputText);
        }
    }

    record ReasonRequest(@NotBlank String reason) {
    }

    record ScheduleRoundRequest(
            @NotNull UUID contentVersionId,
            @NotNull Instant scheduledAt,
            @NotBlank String reason
    ) {
    }

    record StartContentRoundRequest(
            @NotNull UUID contentVersionId,
            @NotBlank String reason
    ) {
    }

    record RescheduleRoundRequest(
            @NotNull Instant scheduledAt,
            @NotBlank String reason
    ) {
    }

    record EnforcementRequest(
            @NotNull SurveyRoundEnforcementMode mode,
            @NotBlank String reason
    ) {
    }

    record CurrentSurveyResponse(
            CurrentRoundResponse round,
            PublishedContentResponse content,
            boolean submitted,
            EligibilityResponse eligibility
    ) {
    }

    record CurrentRoundResponse(
            UUID id,
            int roundNumber,
            UUID contentVersionId,
            SurveyRoundEnforcementMode enforcementMode,
            Instant activatedAt
    ) {
        static CurrentRoundResponse from(SurveyRound value) {
            return new CurrentRoundResponse(
                    value.id().value(),
                    value.roundNumber().value(),
                    value.contentVersionId().value(),
                    value.enforcementMode().orElse(null),
                    value.activatedAt().orElse(null));
        }
    }

    record PublishedContentResponse(
            UUID id,
            Integer versionNumber,
            String name,
            String description,
            List<QuestionSectionResponse> sections
    ) {
        static PublishedContentResponse from(SurveyContentVersion value) {
            return new PublishedContentResponse(
                    value.id().value(),
                    value.versionNumber().map(number -> number.value())
                            .orElse(null),
                    value.name(),
                    value.description().orElse(null),
                    value.questionSections().stream()
                            .map(section -> QuestionSectionResponse.from(
                                    section,
                                    value.questionGroups().stream()
                                            .filter(group -> group.section()
                                                    .id().equals(
                                                            section.id()))
                                            .map(group -> QuestionGroupResponse
                                                    .from(
                                                            group,
                                                            value.questions()
                                                                    .stream()
                                                                    .filter(question ->
                                                                            question.group()
                                                                                    .id()
                                                                                    .equals(group.id()))
                                                                    .toList()))
                                            .toList()))
                            .toList());
        }
    }

    record QuestionSectionResponse(
            UUID sectionId,
            UUID sectionLineageId,
            String sectionKey,
            String title,
            String description,
            int displayOrder,
            List<QuestionGroupResponse> groups
    ) {
        static QuestionSectionResponse from(
                SurveyQuestionSection section,
                List<QuestionGroupResponse> groups
        ) {
            return new QuestionSectionResponse(
                    section.id().value(),
                    section.lineageKey().value(),
                    section.sectionKey(),
                    section.title(),
                    section.description(),
                    section.displayOrder(),
                    groups);
        }
    }

    record QuestionGroupResponse(
            UUID groupId,
            UUID groupLineageId,
            String groupKey,
            String sourceNumber,
            int displayOrder,
            String title,
            String prompt,
            String description,
            List<PublishedQuestionResponse> questions
    ) {
        static QuestionGroupResponse from(
                SurveyQuestionGroup group,
                List<SurveyQuestion> questions
        ) {
            return new QuestionGroupResponse(
                    group.id().value(),
                    group.lineageKey().value(),
                    group.groupKey(),
                    group.sourceNumber(),
                    group.displayOrder(),
                    group.title(),
                    group.prompt(),
                    group.description(),
                    questions.stream()
                            .sorted(Comparator.comparingInt(
                                    SurveyQuestion::itemDisplayOrder))
                            .map(PublishedQuestionResponse::from)
                            .toList());
        }
    }

    record PublishedQuestionResponse(
            UUID questionId,
            UUID questionLineageId,
            String itemKey,
            String itemLabel,
            int itemDisplayOrder,
            SurveyQuestionType type,
            String prompt,
            String description,
            boolean required,
            RuleResponse rule,
            List<PublishedOptionResponse> options
    ) {
        static PublishedQuestionResponse from(SurveyQuestion value) {
            return new PublishedQuestionResponse(
                    value.id().value(),
                    value.lineageKey().value(),
                    value.itemKey(),
                    value.itemLabel(),
                    value.itemDisplayOrder(),
                    value.type(),
                    value.prompt(),
                    value.description(),
                    value.required(),
                    RuleResponse.from(value.rule()),
                    value.options().stream()
                            .map(PublishedOptionResponse::from)
                            .toList());
        }
    }

    record PublishedOptionResponse(
            UUID optionId,
            UUID optionLineageId,
            String optionLocalKey,
            SurveyOptionKind kind,
            String label,
            int displayOrder
    ) {
        static PublishedOptionResponse from(SurveyOption value) {
            return new PublishedOptionResponse(
                    value.id().value(),
                    value.lineageKey().value(),
                    value.localKey(),
                    value.kind(),
                    value.label(),
                    value.displayOrder());
        }
    }

    record SubmissionResponse(
            String code,
            boolean replayed,
            UUID responseId,
            UUID roundId,
            UUID contentVersionId,
            Instant submittedAt
    ) {
    }

    record ContentResponse(
            UUID id,
            Integer versionNumber,
            String status,
            long rowVersion,
            String name,
            String description,
            List<QuestionResponse> questions,
            UUID derivedFromContentVersionId,
            String createdBy,
            Instant createdAt,
            String lastModifiedBy,
            Instant lastModifiedAt,
            String publishedBy,
            Instant publishedAt
    ) {
        static ContentResponse from(SurveyContentVersion value) {
            return new ContentResponse(
                    value.id().value(),
                    value.versionNumber().map(number -> number.value())
                            .orElse(null),
                    value.status().name(),
                    value.rowVersion(),
                    value.name(),
                    value.description().orElse(null),
                    value.questions().stream().map(QuestionResponse::from)
                            .toList(),
                    value.derivedFromContentVersionId()
                            .map(id -> id.value()).orElse(null),
                    value.createdBy().value(),
                    value.createdAt(),
                    value.lastModifiedBy().value(),
                    value.lastModifiedAt(),
                    value.publishedBy().map(actor -> actor.value())
                            .orElse(null),
                    value.publishedAt().orElse(null));
        }
    }

    record QuestionResponse(
            UUID id,
            UUID lineageKey,
            SurveyQuestionType type,
            String prompt,
            String description,
            int displayOrder,
            boolean required,
            RuleResponse rule,
            boolean allowOther,
            List<OptionResponse> options
    ) {
        static QuestionResponse from(SurveyQuestion value) {
            return new QuestionResponse(
                    value.id().value(),
                    value.lineageKey().value(),
                    value.type(),
                    value.prompt(),
                    value.description(),
                    value.displayOrder(),
                    value.required(),
                    RuleResponse.from(value.rule()),
                    value.options().stream().anyMatch(option ->
                            option.kind() == SurveyOptionKind.OTHER),
                    value.options().stream().map(OptionResponse::from)
                            .toList());
        }
    }

    record RuleResponse(
            Integer minimumSelections,
            Integer maximumSelections,
            Integer maxLength,
            BigDecimal minimum,
            BigDecimal maximum,
            Boolean decimalAllowed,
            Integer decimalScale,
            String minimumLabel,
            String maximumLabel
    ) {
        static RuleResponse from(QuestionRule rule) {
            return switch (rule) {
                case SingleChoiceRule ignored -> new RuleResponse(
                        null, null, null, null, null, null, null, null, null);
                case MultipleChoiceRule value -> new RuleResponse(
                        value.minimumSelections(), value.maximumSelections(),
                        null, null, null, null, null, null, null);
                case ShortTextRule value -> new RuleResponse(
                        null, null, value.maxLength(), null, null, null, null,
                        null, null);
                case LongTextRule value -> new RuleResponse(
                        null, null, value.maxLength(), null, null, null, null,
                        null, null);
                case NumberRule value -> new RuleResponse(
                        null, null, null, value.minimum(), value.maximum(),
                        value.decimalAllowed(), value.decimalScale(), null,
                        null);
                case ScaleRule value -> new RuleResponse(
                        null, null, null,
                        BigDecimal.valueOf(value.minimum()),
                        BigDecimal.valueOf(value.maximum()), null, null,
                        value.minimumLabel(), value.maximumLabel());
            };
        }
    }

    record OptionResponse(
            UUID id,
            UUID lineageKey,
            String optionLocalKey,
            SurveyOptionKind kind,
            String label,
            int displayOrder
    ) {
        static OptionResponse from(SurveyOption value) {
            return new OptionResponse(
                    value.id().value(), value.lineageKey().value(),
                    value.localKey(), value.kind(), value.label(),
                    value.displayOrder());
        }
    }

    record RoundResponse(
            UUID id,
            int roundNumber,
            UUID contentVersionId,
            SurveyRoundStatus status,
            SurveyRoundEnforcementMode enforcementMode,
            Instant scheduledAt,
            Instant activatedAt,
            Instant closedAt,
            Instant canceledAt,
            UUID closedByRoundId,
            String createdBy,
            Instant createdAt,
            long rowVersion
    ) {
        static RoundResponse from(SurveyRound value) {
            return new RoundResponse(
                    value.id().value(), value.roundNumber().value(),
                    value.contentVersionId().value(), value.status(),
                    value.enforcementMode().orElse(null),
                    value.scheduledAt().orElse(null),
                    value.activatedAt().orElse(null),
                    value.closedAt().orElse(null),
                    value.canceledAt().orElse(null),
                    value.closedByRoundId().map(id -> id.value()).orElse(null),
                    value.createdBy().value(), value.createdAt(),
                    value.rowVersion());
        }
    }

    record TransitionResponse(
            UUID id,
            UUID roundId,
            UUID contentVersionId,
            String type,
            String fromStatus,
            String toStatus,
            String fromEnforcementMode,
            String toEnforcementMode,
            Instant previousScheduledAt,
            Instant newScheduledAt,
            String actorId,
            String trigger,
            String reason,
            Instant occurredAt,
            UUID relatedRoundId
    ) {
        static TransitionResponse from(SurveyRoundTransition value) {
            return new TransitionResponse(
                    value.id().value(), value.roundId().value(),
                    value.contentVersionId().value(), value.type().name(),
                    value.fromStatus().map(Enum::name).orElse(null),
                    value.toStatus().map(Enum::name).orElse(null),
                    value.fromEnforcementMode().map(Enum::name).orElse(null),
                    value.toEnforcementMode().map(Enum::name).orElse(null),
                    value.previousScheduledAt().orElse(null),
                    value.newScheduledAt().orElse(null), value.actorId().value(),
                    value.trigger().name(), value.reason().orElse(null),
                    value.occurredAt(),
                    value.relatedRoundId().map(id -> id.value()).orElse(null));
        }
    }

    record EligibilityResponse(
            boolean eligible,
            String surveyRequirement,
            String reason,
            String nextAction,
            UUID activeRoundId,
            Instant evaluatedAt,
            List<String> capabilities
    ) {
        static EligibilityResponse from(ServiceEligibilityDecision value) {
            return new EligibilityResponse(
                    value.eligible(), value.surveyRequirement().name(),
                    value.reason().map(Enum::name).orElse(null),
                    value.nextAction().map(Enum::name).orElse(null),
                    value.activeRoundId().map(id -> id.value()).orElse(null),
                    value.evaluatedAt(),
                    value.capabilities().stream().map(Enum::name).sorted()
                            .toList());
        }
    }

    record ResponseSummary(
            UUID id,
            UUID roundId,
            int roundNumber,
            UUID contentVersionId,
            Instant submittedAt
    ) {
        static ResponseSummary from(SurveyResponse value) {
            return new ResponseSummary(
                    value.id().value(), value.roundId().value(),
                    value.roundNumber().value(),
                    value.contentVersionId().value(), value.submittedAt());
        }
    }

    record ResponseDetail(
            UUID id,
            UUID roundId,
            int roundNumber,
            UUID contentVersionId,
            Instant submittedAt,
            List<AnswerResponse> answers,
            PublishedContentResponse content
    ) {
        static ResponseDetail from(
                SurveyResponse value,
                SurveyContentVersion content
        ) {
            return new ResponseDetail(
                    value.id().value(), value.roundId().value(),
                    value.roundNumber().value(),
                    value.contentVersionId().value(), value.submittedAt(),
                    value.answers().stream().map(AnswerResponse::from)
                            .toList(),
                    PublishedContentResponse.from(content));
        }
    }

    record AnswerResponse(
            UUID questionId,
            SurveyAnswerType type,
            String text,
            BigDecimal number,
            Integer scale,
            List<SelectionResponse> selections
    ) {
        static AnswerResponse from(SurveyAnswer answer) {
            return switch (answer) {
                case SingleChoiceAnswer value -> new AnswerResponse(
                        value.questionId().value(), value.answerType(), null,
                        null, null,
                        List.of(SelectionResponse.from(value.selection())));
                case MultipleChoiceAnswer value -> new AnswerResponse(
                        value.questionId().value(), value.answerType(), null,
                        null, null, value.selections().stream()
                        .map(SelectionResponse::from).toList());
                case ShortTextAnswer value -> new AnswerResponse(
                        value.questionId().value(), value.answerType(),
                        value.value(), null, null, List.of());
                case LongTextAnswer value -> new AnswerResponse(
                        value.questionId().value(), value.answerType(),
                        value.value(), null, null, List.of());
                case NumberAnswer value -> new AnswerResponse(
                        value.questionId().value(), value.answerType(), null,
                        value.value(), null, List.of());
                case ScaleAnswer value -> new AnswerResponse(
                        value.questionId().value(), value.answerType(), null,
                        null, value.value(), List.of());
            };
        }
    }

    record SelectionResponse(UUID optionId, String inputText) {
        static SelectionResponse from(OptionSelection value) {
            return new SelectionResponse(
                    value.optionId().value(),
                    value.optionalInputText().orElse(null));
        }
    }

    static List<ResponseSummary> history(List<SurveyResponse> values) {
        return values.stream()
                .sorted(Comparator.comparing(SurveyResponse::submittedAt)
                        .reversed())
                .map(ResponseSummary::from)
                .toList();
    }

    private static UUID idOrRandom(UUID value) {
        return value == null ? UUID.randomUUID() : value;
    }

    private static <T> T required(T value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
