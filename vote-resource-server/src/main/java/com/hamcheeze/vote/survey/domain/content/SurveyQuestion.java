package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import com.hamcheeze.vote.survey.domain.common.SurveyViolation;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;

public final class SurveyQuestion {

    private final SurveyQuestionId id;
    private final SurveyQuestionLineageKey lineageKey;
    private final SurveyQuestionType type;
    private final String prompt;
    private final String description;
    private final int displayOrder;
    private final boolean required;
    private final QuestionRule rule;
    private final List<SurveyOption> options;

    public SurveyQuestion(
            SurveyQuestionId id,
            SurveyQuestionLineageKey lineageKey,
            SurveyQuestionType type,
            String prompt,
            String description,
            int displayOrder,
            boolean required,
            QuestionRule rule,
            List<SurveyOption> options
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.lineageKey = Objects.requireNonNull(lineageKey, "lineageKey");
        this.type = Objects.requireNonNull(type, "type");
        this.prompt = SurveyContentText.required(
                prompt,
                SurveyContentLimits.MAX_QUESTION_PROMPT_LENGTH,
                "SURVEY_QUESTION_PROMPT_REQUIRED",
                "SURVEY_QUESTION_PROMPT_TOO_LONG",
                "question.prompt");
        this.description = SurveyContentText.optional(
                description,
                SurveyContentLimits.MAX_QUESTION_DESCRIPTION_LENGTH,
                "SURVEY_QUESTION_DESCRIPTION_TOO_LONG",
                "question.description");
        if (displayOrder < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_QUESTION_DISPLAY_ORDER_INVALID",
                    "question.displayOrder",
                    "question displayOrder must be positive");
        }
        this.displayOrder = displayOrder;
        if (!required) {
            throw SurveyDomainException.invariant(
                    "SURVEY_QUESTION_MUST_BE_REQUIRED",
                    "question.required",
                    "all survey questions must be required");
        }
        this.required = true;
        this.rule = Objects.requireNonNull(rule, "rule");
        if (rule.questionType() != type) {
            throw SurveyDomainException.invariant(
                    "SURVEY_QUESTION_RULE_TYPE_MISMATCH",
                    "question.rule",
                    "question type and rule type must match");
        }
        Objects.requireNonNull(options, "options");
        if (options.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException("options must not contain null");
        }
        List<SurveyOption> orderedOptions = options.stream()
                .sorted(Comparator.comparingInt(SurveyOption::displayOrder))
                .toList();
        validateOptions(type, rule, orderedOptions);
        this.options = List.copyOf(orderedOptions);
    }

    public static SurveyQuestion choice(
            SurveyQuestionId id,
            SurveyQuestionLineageKey lineageKey,
            SurveyQuestionType type,
            String prompt,
            String description,
            int displayOrder,
            boolean required,
            QuestionRule rule,
            List<SurveyOption> standardOptions,
            boolean allowOther,
            Supplier<SurveyOptionId> otherOptionIdSupplier,
            Supplier<SurveyOptionLineageKey> otherLineageKeySupplier
    ) {
        if (!Objects.requireNonNull(type, "type").isChoice()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_OTHER_ONLY_FOR_CHOICE",
                    "question.type",
                    "choice factory requires a choice question type");
        }
        Objects.requireNonNull(standardOptions, "standardOptions");
        if (standardOptions.stream()
                .anyMatch(option -> option.kind() != SurveyOptionKind.STANDARD)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_STANDARD_OPTIONS_REQUIRED",
                    "question.options",
                    "choice factory accepts only STANDARD options");
        }
        List<SurveyOption> materializedOptions =
                new ArrayList<>(standardOptions);
        if (allowOther) {
            Objects.requireNonNull(
                    otherOptionIdSupplier,
                    "otherOptionIdSupplier");
            Objects.requireNonNull(
                    otherLineageKeySupplier,
                    "otherLineageKeySupplier");
            int otherDisplayOrder = standardOptions.stream()
                    .mapToInt(SurveyOption::displayOrder)
                    .max()
                    .orElse(0) + 1;
            materializedOptions.add(SurveyOption.other(
                    Objects.requireNonNull(
                            otherOptionIdSupplier.get(),
                            "generated other optionId"),
                    Objects.requireNonNull(
                            otherLineageKeySupplier.get(),
                            "generated other option lineageKey"),
                    otherDisplayOrder));
        }
        return new SurveyQuestion(
                id,
                lineageKey,
                type,
                prompt,
                description,
                displayOrder,
                required,
                rule,
                materializedOptions);
    }

    public SurveyQuestionId id() {
        return id;
    }

    public SurveyQuestionLineageKey lineageKey() {
        return lineageKey;
    }

    public SurveyQuestionType type() {
        return type;
    }

    public String prompt() {
        return prompt;
    }

    public String description() {
        return description;
    }

    public int displayOrder() {
        return displayOrder;
    }

    public boolean required() {
        return required;
    }

    public QuestionRule rule() {
        return rule;
    }

    public List<SurveyOption> options() {
        return options;
    }

    SurveyQuestion copyWithIds(
            SurveyQuestionId newId,
            Function<SurveyOption, SurveyOptionId> optionIdGenerator
    ) {
        List<SurveyOption> clonedOptions = options.stream()
                .map(option -> option.copyWithId(
                        optionIdGenerator.apply(option)))
                .toList();
        return new SurveyQuestion(
                newId,
                lineageKey,
                type,
                prompt,
                description,
                displayOrder,
                required,
                rule,
                clonedOptions);
    }

    private static void validateOptions(
            SurveyQuestionType type,
            QuestionRule rule,
            List<SurveyOption> options
    ) {
        List<SurveyViolation> violations = new ArrayList<>();
        if (!type.isChoice()) {
            if (!options.isEmpty()) {
                violations.add(SurveyViolation.of(
                        "SURVEY_NON_CHOICE_OPTIONS_NOT_ALLOWED",
                        "question.options",
                        "non-choice questions must not have options"));
            }
            throwIfAny(violations);
            return;
        }

        int maximumOptionCount = type == SurveyQuestionType.SINGLE_CHOICE
                ? 20
                : SurveyContentLimits.MAX_OPTIONS_PER_QUESTION;
        if (options.size() < 2 || options.size() > maximumOptionCount) {
            violations.add(new SurveyViolation(
                    "SURVEY_CHOICE_OPTION_COUNT_INVALID",
                    "question.options",
                    "choice question option count is invalid",
                    java.util.Map.of(
                            "minimum", "2",
                            "maximum", Integer.toString(maximumOptionCount))));
        }
        findDuplicates(options, SurveyOption::id).forEach(duplicate ->
                violations.add(SurveyViolation.of(
                        "SURVEY_OPTION_ID_DUPLICATED",
                        "question.options",
                        "option id must be unique within a question")));
        findDuplicates(options, SurveyOption::lineageKey).forEach(duplicate ->
                violations.add(SurveyViolation.of(
                        "SURVEY_OPTION_LINEAGE_DUPLICATED",
                        "question.options",
                        "option lineage must be unique within a question")));
        findDuplicates(options, SurveyOption::displayOrder).forEach(duplicate ->
                violations.add(SurveyViolation.of(
                        "SURVEY_OPTION_DISPLAY_ORDER_DUPLICATED",
                        "question.options",
                        "option displayOrder must be unique within a question")));

        List<SurveyOption> otherOptions = options.stream()
                .filter(option -> option.kind() == SurveyOptionKind.OTHER)
                .toList();
        if (otherOptions.size() > 1) {
            violations.add(SurveyViolation.of(
                    "SURVEY_OTHER_OPTION_DUPLICATED",
                    "question.options",
                    "a question can have at most one OTHER option"));
        } else if (otherOptions.size() == 1
                && otherOptions.getFirst().displayOrder()
                != options.stream()
                .mapToInt(SurveyOption::displayOrder)
                .max()
                .orElseThrow()) {
            violations.add(SurveyViolation.of(
                    "SURVEY_OTHER_OPTION_NOT_LAST",
                    "question.options",
                    "OTHER option must be last"));
        }

        if (rule instanceof MultipleChoiceRule multipleRule
                && multipleRule.maximumSelections() > options.size()) {
            violations.add(SurveyViolation.of(
                    "SURVEY_MULTIPLE_CHOICE_MAXIMUM_EXCEEDS_OPTIONS",
                    "question.rule.maximumSelections",
                    "maximumSelections must not exceed option count"));
        }
        throwIfAny(violations);
    }

    private static <T, K> Set<K> findDuplicates(
            List<T> values,
            Function<T, K> keyExtractor
    ) {
        Set<K> seen = new HashSet<>();
        Set<K> duplicates = new HashSet<>();
        for (T value : values) {
            K key = keyExtractor.apply(value);
            if (!seen.add(key)) {
                duplicates.add(key);
            }
        }
        return duplicates;
    }

    private static void throwIfAny(List<SurveyViolation> violations) {
        if (!violations.isEmpty()) {
            throw new SurveyValidationException(violations);
        }
    }
}
