package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskText;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.common.TaskViolation;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class TaskQuestion {

    private final TaskQuestionId id;
    private final int displayOrder;
    private final TaskQuestionType type;
    private final String content;
    private final String description;
    private final TaskQuestionConstraint constraint;
    private final List<TaskOption> options;

    public TaskQuestion(
            TaskQuestionId id,
            int displayOrder,
            TaskQuestionType type,
            String content,
            String description,
            TaskQuestionConstraint constraint,
            List<TaskOption> options
    ) {
        this.id = Objects.requireNonNull(id, "id");
        if (displayOrder < 1) {
            throw TaskDomainException.invariant(
                    "TASK_QUESTION_DISPLAY_ORDER_INVALID",
                    "question.displayOrder",
                    "question displayOrder must be positive");
        }
        this.displayOrder = displayOrder;
        this.type = Objects.requireNonNull(type, "type");
        this.content = TaskText.required(
                content,
                TaskLimits.MAX_QUESTION_CONTENT_LENGTH,
                "TASK_QUESTION_CONTENT",
                "question.content");
        this.description = TaskText.optional(
                description,
                TaskLimits.MAX_QUESTION_DESCRIPTION_LENGTH,
                "TASK_QUESTION_DESCRIPTION",
                "question.description");
        this.constraint = Objects.requireNonNull(constraint, "constraint");
        if (constraint.questionType() != type) {
            throw TaskDomainException.invariant(
                    "TASK_QUESTION_CONSTRAINT_TYPE_MISMATCH",
                    "question.constraint",
                    "question type and constraint type must match");
        }
        Objects.requireNonNull(options, "options");
        if (options.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "options must not contain null");
        }
        this.options = options.stream()
                .sorted(Comparator.comparingInt(TaskOption::displayOrder))
                .toList();
        validateStructure();
    }

    public TaskQuestionId id() {
        return id;
    }

    public int displayOrder() {
        return displayOrder;
    }

    public TaskQuestionType type() {
        return type;
    }

    public String content() {
        return content;
    }

    public String description() {
        return description;
    }

    public TaskQuestionConstraint constraint() {
        return constraint;
    }

    public List<TaskOption> options() {
        return options;
    }

    public TaskAnswerValue validateAndNormalize(TaskAnswerValue answer) {
        Objects.requireNonNull(answer, "answer");
        if (answer.questionType() != type) {
            throw invalid(
                    "TASK_ANSWER_TYPE_MISMATCH",
                    "answer",
                    "answer type does not match question type");
        }
        return switch (answer) {
            case SingleChoiceValue single -> normalizeSingle(single);
            case MultipleChoiceValue multiple -> normalizeMultiple(multiple);
            case ShortTextValue shortText -> normalizeShortText(shortText);
            case LongTextValue longText -> normalizeLongText(longText);
            case NumberValue number -> normalizeNumber(number);
            case ScaleValue scale -> normalizeScale(scale);
        };
    }

    public boolean hasOption(TaskOptionId optionId) {
        return options.stream().anyMatch(option -> option.id().equals(optionId));
    }

    public boolean hasContinuousOptionOrder() {
        for (int index = 0; index < options.size(); index++) {
            if (options.get(index).displayOrder() != index + 1) {
                return false;
            }
        }
        return true;
    }

    private void validateStructure() {
        List<TaskViolation> violations = new ArrayList<>();
        collectDuplicates(
                options,
                TaskOption::id,
                "TASK_OPTION_ID_DUPLICATED",
                "question.options",
                violations);
        collectDuplicates(
                options,
                TaskOption::displayOrder,
                "TASK_OPTION_DISPLAY_ORDER_DUPLICATED",
                "question.options",
                violations);
        collectDuplicates(
                options,
                TaskOption::content,
                "TASK_OPTION_CONTENT_DUPLICATED",
                "question.options",
                violations);

        if (!type.isChoice()) {
            if (!options.isEmpty()) {
                violations.add(violation(
                        "TASK_OPTIONS_NOT_ALLOWED",
                        "question.options",
                        "non-choice question must not have options"));
            }
        } else {
            long standardCount = options.stream()
                    .filter(option -> option.kind() == TaskOptionKind.STANDARD)
                    .count();
            long otherCount = options.stream()
                    .filter(option -> option.kind() == TaskOptionKind.OTHER)
                    .count();
            if (standardCount < 2) {
                violations.add(violation(
                        "TASK_STANDARD_OPTIONS_TOO_FEW",
                        "question.options",
                        "choice question must have at least two STANDARD options"));
            }
            if (options.size() > TaskLimits.MAX_OPTIONS) {
                violations.add(violation(
                        "TASK_OPTIONS_TOO_MANY",
                        "question.options",
                        "choice question has too many options"));
            }
            if (otherCount > 1) {
                violations.add(violation(
                        "TASK_OTHER_OPTION_DUPLICATED",
                        "question.options",
                        "choice question may have at most one OTHER option"));
            }
            if (otherCount == 1
                    && options.getLast().kind() != TaskOptionKind.OTHER) {
                violations.add(violation(
                        "TASK_OTHER_OPTION_NOT_LAST",
                        "question.options",
                        "OTHER option must be last"));
            }
            if (constraint instanceof MultipleChoiceConstraint multiple
                    && multiple.maximumSelections() > options.size()) {
                violations.add(violation(
                        "TASK_MULTIPLE_MAXIMUM_EXCEEDS_OPTIONS",
                        "question.constraint.maximumSelections",
                        "maximumSelections must not exceed option count"));
            }
        }
        if (!violations.isEmpty()) {
            throw new TaskValidationException(violations);
        }
    }

    private SingleChoiceValue normalizeSingle(SingleChoiceValue answer) {
        return new SingleChoiceValue(normalizeSelection(answer.selection()));
    }

    private MultipleChoiceValue normalizeMultiple(MultipleChoiceValue answer) {
        MultipleChoiceConstraint multiple =
                (MultipleChoiceConstraint) constraint;
        int size = answer.selections().size();
        if (size < multiple.minimumSelections()
                || size > multiple.maximumSelections()) {
            throw invalid(
                    "TASK_MULTIPLE_SELECTION_COUNT_INVALID",
                    "answer.selections",
                    "selection count is outside the configured range");
        }
        Set<TaskOptionId> ids = new HashSet<>();
        List<TaskOptionSelection> normalized = new ArrayList<>();
        for (TaskOptionSelection selection : answer.selections()) {
            if (!ids.add(selection.optionId())) {
                throw invalid(
                        "TASK_OPTION_SELECTION_DUPLICATED",
                        "answer.selections",
                        "same option must not be selected more than once");
            }
            normalized.add(normalizeSelection(selection));
        }
        Map<TaskOptionId, Integer> orderById = options.stream()
                .collect(Collectors.toMap(TaskOption::id, TaskOption::displayOrder));
        normalized.sort(Comparator.comparingInt(
                selection -> orderById.get(selection.optionId())));
        return new MultipleChoiceValue(normalized);
    }

    private ShortTextValue normalizeShortText(ShortTextValue answer) {
        String normalized = normalizeRequiredAnswerText(
                answer.value(),
                ((ShortTextConstraint) constraint).maxLength(),
                "TASK_SHORT_TEXT");
        if (normalized.indexOf('\n') >= 0 || normalized.indexOf('\r') >= 0) {
            throw invalid(
                    "TASK_SHORT_TEXT_LINE_BREAK_NOT_ALLOWED",
                    "answer.value",
                    "short text must not contain line breaks");
        }
        return new ShortTextValue(normalized);
    }

    private LongTextValue normalizeLongText(LongTextValue answer) {
        String normalized = normalizeRequiredAnswerText(
                answer.value(),
                ((LongTextConstraint) constraint).maxLength(),
                "TASK_LONG_TEXT");
        return new LongTextValue(normalized);
    }

    private NumberValue normalizeNumber(NumberValue answer) {
        NumberConstraint number = (NumberConstraint) constraint;
        BigDecimal value = answer.value().stripTrailingZeros();
        NumberConstraint.validateBound(value, "answer.value");
        if (!number.decimalAllowed()) {
            NumberConstraint.requireInteger(value, "answer.value");
        }
        if (number.minimumValue() != null
                && value.compareTo(number.minimumValue()) < 0) {
            throw invalid(
                    "TASK_NUMBER_BELOW_MINIMUM",
                    "answer.value",
                    "number is below minimumValue");
        }
        if (number.maximumValue() != null
                && value.compareTo(number.maximumValue()) > 0) {
            throw invalid(
                    "TASK_NUMBER_ABOVE_MAXIMUM",
                    "answer.value",
                    "number exceeds maximumValue");
        }
        return new NumberValue(value);
    }

    private ScaleValue normalizeScale(ScaleValue answer) {
        ScaleConstraint scale = (ScaleConstraint) constraint;
        if (answer.value() < scale.minimumValue()
                || answer.value() > scale.maximumValue()) {
            throw invalid(
                    "TASK_SCALE_VALUE_OUT_OF_RANGE",
                    "answer.value",
                    "scale value is outside the configured range");
        }
        return answer;
    }

    private TaskOptionSelection normalizeSelection(
            TaskOptionSelection selection
    ) {
        TaskOption option = options.stream()
                .filter(candidate -> candidate.id().equals(selection.optionId()))
                .findFirst()
                .orElseThrow(() -> invalid(
                        "TASK_OPTION_NOT_IN_QUESTION",
                        "answer.selection.optionId",
                        "selected option does not belong to the question"));
        if (option.kind() == TaskOptionKind.STANDARD) {
            if (selection.otherText() != null) {
                throw invalid(
                        "TASK_STANDARD_OPTION_OTHER_TEXT_NOT_ALLOWED",
                        "answer.selection.otherText",
                        "STANDARD option must not have otherText");
            }
            return selection.normalized(null);
        }
        String normalized = normalizeRequiredAnswerText(
                selection.otherText(),
                TaskLimits.MAX_OTHER_TEXT_LENGTH,
                "TASK_OTHER_TEXT");
        return selection.normalized(normalized);
    }

    private static String normalizeRequiredAnswerText(
            String value,
            int maxLength,
            String codePrefix
    ) {
        if (value == null || value.isBlank()) {
            throw invalid(
                    codePrefix + "_REQUIRED",
                    "answer.value",
                    "answer text must not be blank");
        }
        String normalized = value.strip();
        if (TaskText.codePointLength(normalized) > maxLength) {
            throw invalid(
                    codePrefix + "_TOO_LONG",
                    "answer.value",
                    "answer text is too long");
        }
        return normalized;
    }

    private static <T, K> void collectDuplicates(
            List<T> values,
            Function<T, K> key,
            String code,
            String path,
            List<TaskViolation> violations
    ) {
        Map<K, Integer> counts = values.stream().collect(Collectors.toMap(
                key,
                ignored -> 1,
                Integer::sum,
                LinkedHashMap::new));
        if (counts.values().stream().anyMatch(count -> count > 1)) {
            violations.add(violation(code, path, "duplicate value is not allowed"));
        }
    }

    private static TaskValidationException invalid(
            String code,
            String path,
            String message
    ) {
        return new TaskValidationException(List.of(violation(code, path, message)));
    }

    private static TaskViolation violation(
            String code,
            String path,
            String message
    ) {
        return TaskViolation.of(code, path, message);
    }
}
