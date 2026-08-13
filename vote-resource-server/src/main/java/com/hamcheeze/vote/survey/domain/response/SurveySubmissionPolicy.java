package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import com.hamcheeze.vote.survey.domain.common.SurveyViolation;
import com.hamcheeze.vote.survey.domain.content.LongTextRule;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentLimits;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

public final class SurveySubmissionPolicy {

    public SurveySubmissionResult submitFinalResponse(
            SurveyResponseId responseId,
            SurveyUserId userId,
            SurveyRoundId requestedRoundId,
            SurveyRound lockedActiveRound,
            SurveyContentVersion contentVersion,
            boolean existingFinalResponse,
            List<SurveyAnswer> submittedAnswers,
            Instant submittedAt
    ) {
        Objects.requireNonNull(responseId, "responseId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(requestedRoundId, "requestedRoundId");
        Objects.requireNonNull(lockedActiveRound, "lockedActiveRound");
        Objects.requireNonNull(contentVersion, "contentVersion");
        Objects.requireNonNull(submittedAt, "submittedAt");
        validateSubmissionContext(
                requestedRoundId,
                lockedActiveRound,
                contentVersion,
                existingFinalResponse,
                submittedAt);

        List<SurveyAnswer> normalizedAnswers = validateAndNormalizeAnswers(
                contentVersion,
                Objects.requireNonNull(submittedAnswers, "submittedAnswers"));
        SurveyResponse response = SurveyResponse.createValidated(
                responseId,
                userId,
                lockedActiveRound.id(),
                lockedActiveRound.roundNumber(),
                contentVersion.id(),
                submittedAt,
                normalizedAnswers);
        SurveyResponseSubmitted event = new SurveyResponseSubmitted(
                response.id(),
                response.roundId(),
                response.contentVersionId(),
                response.submittedAt());
        return new SurveySubmissionResult(response, event);
    }

    private static void validateSubmissionContext(
            SurveyRoundId requestedRoundId,
            SurveyRound activeRound,
            SurveyContentVersion contentVersion,
            boolean existingFinalResponse,
            Instant submittedAt
    ) {
        if (activeRound.status() != SurveyRoundStatus.ACTIVE) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SUBMISSION_ACTIVE_ROUND_REQUIRED",
                    "roundId",
                    "submission requires the current ACTIVE round");
        }
        if (!activeRound.id().equals(requestedRoundId)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SUBMISSION_ROUND_CHANGED",
                    "roundId",
                    "requested round is no longer active");
        }
        if (existingFinalResponse) {
            throw SurveyDomainException.invariant(
                    "SURVEY_RESPONSE_ALREADY_SUBMITTED",
                    "roundId",
                    "final response already exists for this round");
        }
        if (contentVersion.status()
                != SurveyContentVersionStatus.PUBLISHED) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SUBMISSION_PUBLISHED_CONTENT_REQUIRED",
                    "contentVersionId",
                    "submission requires published content");
        }
        SurveyContentVersionId roundContentVersionId =
                activeRound.contentVersionId();
        if (!roundContentVersionId.equals(contentVersion.id())) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SUBMISSION_CONTENT_VERSION_MISMATCH",
                    "contentVersionId",
                    "round and response content version must match");
        }
        if (submittedAt.isBefore(activeRound.activatedAt().orElseThrow())) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SUBMISSION_TIME_INVALID",
                    "submittedAt",
                    "submittedAt must not be before round activation");
        }
    }

    private static List<SurveyAnswer> validateAndNormalizeAnswers(
            SurveyContentVersion contentVersion,
            List<SurveyAnswer> answers
    ) {
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "submittedAnswers must not contain null");
        }
        Map<SurveyQuestionId, SurveyQuestion> questionsById =
                contentVersion.questions().stream()
                        .collect(java.util.stream.Collectors.toMap(
                                SurveyQuestion::id,
                                Function.identity(),
                                (left, right) -> left,
                                LinkedHashMap::new));
        Map<SurveyQuestionId, List<SurveyAnswer>> answersByQuestion =
                new LinkedHashMap<>();
        for (SurveyAnswer answer : answers) {
            answersByQuestion
                    .computeIfAbsent(
                            answer.questionId(),
                            ignored -> new ArrayList<>())
                    .add(answer);
        }

        List<SurveyViolation> violations = new ArrayList<>();
        for (Map.Entry<SurveyQuestionId, List<SurveyAnswer>> entry
                : answersByQuestion.entrySet()) {
            if (!questionsById.containsKey(entry.getKey())) {
                violations.add(violation(
                        "SURVEY_ANSWER_QUESTION_UNKNOWN",
                        entry.getKey(),
                        "answers",
                        "answer references an unknown question"));
            }
            if (entry.getValue().size() > 1) {
                violations.add(violation(
                        "SURVEY_ANSWER_QUESTION_DUPLICATED",
                        entry.getKey(),
                        "answers",
                        "a question must have exactly one answer"));
            }
        }
        for (SurveyQuestion question : contentVersion.questions()) {
            if (!answersByQuestion.containsKey(question.id())) {
                violations.add(violation(
                        "SURVEY_REQUIRED_ANSWER_MISSING",
                        question.id(),
                        answerPath(question.id()),
                        "answer is required"));
            }
        }

        List<NormalizedAnswer> normalized = new ArrayList<>();
        for (SurveyQuestion question : contentVersion.questions()) {
            List<SurveyAnswer> matches = answersByQuestion.get(question.id());
            if (matches == null || matches.size() != 1) {
                continue;
            }
            SurveyAnswer answer = matches.getFirst();
            if (!matchesType(question.type(), answer.answerType())) {
                violations.add(violation(
                        "SURVEY_ANSWER_TYPE_MISMATCH",
                        question.id(),
                        answerPath(question.id()),
                        "answer type does not match question type"));
                continue;
            }
            SurveyAnswer normalizedAnswer = normalizeAnswer(
                    question,
                    answer,
                    violations);
            if (normalizedAnswer != null) {
                normalized.add(new NormalizedAnswer(
                        question.displayOrder(),
                        normalizedAnswer));
            }
        }
        if (!violations.isEmpty()) {
            throw new SurveyValidationException(violations);
        }
        return normalized.stream()
                .sorted(Comparator.comparingInt(NormalizedAnswer::displayOrder))
                .map(NormalizedAnswer::answer)
                .toList();
    }

    private static SurveyAnswer normalizeAnswer(
            SurveyQuestion question,
            SurveyAnswer answer,
            List<SurveyViolation> violations
    ) {
        return switch (answer) {
            case SingleChoiceAnswer single -> normalizeSingleChoice(
                    question,
                    single,
                    violations);
            case MultipleChoiceAnswer multiple -> normalizeMultipleChoice(
                    question,
                    multiple,
                    violations);
            case ShortTextAnswer text -> normalizeShortText(
                    question,
                    text,
                    violations);
            case LongTextAnswer text -> normalizeLongText(
                    question,
                    text,
                    violations);
            case NumberAnswer number -> normalizeNumber(
                    question,
                    number,
                    violations);
            case ScaleAnswer scale -> normalizeScale(
                    question,
                    scale,
                    violations);
        };
    }

    private static SingleChoiceAnswer normalizeSingleChoice(
            SurveyQuestion question,
            SingleChoiceAnswer answer,
            List<SurveyViolation> violations
    ) {
        OptionSelection selection = normalizeSelection(
                question,
                answer.selection(),
                violations);
        return selection == null
                ? null
                : new SingleChoiceAnswer(question.id(), selection);
    }

    private static MultipleChoiceAnswer normalizeMultipleChoice(
            SurveyQuestion question,
            MultipleChoiceAnswer answer,
            List<SurveyViolation> violations
    ) {
        List<OptionSelection> selections = answer.selections();
        MultipleChoiceRule rule = (MultipleChoiceRule) question.rule();
        if (selections.size() < rule.minimumSelections()
                || selections.size() > rule.maximumSelections()) {
            violations.add(violation(
                    "SURVEY_MULTIPLE_SELECTION_COUNT_INVALID",
                    question.id(),
                    answerPath(question.id()) + ".selections",
                    "selection count is outside the configured range"));
        }
        Set<SurveyOptionId> seen = new HashSet<>();
        if (selections.stream()
                .map(OptionSelection::optionId)
                .anyMatch(optionId -> !seen.add(optionId))) {
            violations.add(violation(
                    "SURVEY_OPTION_SELECTION_DUPLICATED",
                    question.id(),
                    answerPath(question.id()) + ".selections",
                    "the same option must not be selected twice"));
        }
        Map<SurveyOptionId, Integer> displayOrders = question.options().stream()
                .collect(java.util.stream.Collectors.toMap(
                        SurveyOption::id,
                        SurveyOption::displayOrder));
        List<OptionSelection> normalized = selections.stream()
                .map(selection -> normalizeSelection(
                        question,
                        selection,
                        violations))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparingInt(selection ->
                        displayOrders.getOrDefault(
                                selection.optionId(),
                                Integer.MAX_VALUE)))
                .toList();
        return new MultipleChoiceAnswer(question.id(), normalized);
    }

    private static OptionSelection normalizeSelection(
            SurveyQuestion question,
            OptionSelection selection,
            List<SurveyViolation> violations
    ) {
        SurveyOption option = question.options().stream()
                .filter(candidate -> candidate.id().equals(selection.optionId()))
                .findFirst()
                .orElse(null);
        String path = answerPath(question.id()) + ".selections";
        if (option == null) {
            violations.add(violation(
                    "SURVEY_OPTION_NOT_IN_QUESTION",
                    question.id(),
                    path,
                    "selected option does not belong to the question"));
            return null;
        }
        SurveyAnswerTextNormalizer.NormalizedText input =
                SurveyAnswerTextNormalizer.normalize(selection.inputText());
        if (input.hasForbiddenControlCharacter()) {
            violations.add(violation(
                    "SURVEY_OTHER_TEXT_CONTROL_CHARACTER_INVALID",
                    question.id(),
                    path + ".inputText",
                    "inputText contains a forbidden control character"));
        }
        if (option.kind() == SurveyOptionKind.STANDARD) {
            if (selection.inputText() != null) {
                violations.add(violation(
                        "SURVEY_STANDARD_OPTION_INPUT_NOT_ALLOWED",
                        question.id(),
                        path + ".inputText",
                        "STANDARD option must not have inputText"));
            }
            return selection.normalized(null);
        }
        if (input.isBlank()) {
            violations.add(violation(
                    "SURVEY_OTHER_TEXT_REQUIRED",
                    question.id(),
                    path + ".inputText",
                    "OTHER option requires inputText"));
        } else if (input.codePointLength()
                > SurveyContentLimits.MAX_OTHER_TEXT_LENGTH) {
            violations.add(violation(
                    "SURVEY_OTHER_TEXT_TOO_LONG",
                    question.id(),
                    path + ".inputText",
                    "OTHER inputText is too long"));
        }
        return selection.normalized(input.value());
    }

    private static ShortTextAnswer normalizeShortText(
            SurveyQuestion question,
            ShortTextAnswer answer,
            List<SurveyViolation> violations
    ) {
        ShortTextRule rule = (ShortTextRule) question.rule();
        String normalized = validateText(
                question,
                answer.value(),
                rule.maxLength(),
                violations);
        return new ShortTextAnswer(question.id(), normalized);
    }

    private static LongTextAnswer normalizeLongText(
            SurveyQuestion question,
            LongTextAnswer answer,
            List<SurveyViolation> violations
    ) {
        LongTextRule rule = (LongTextRule) question.rule();
        String normalized = validateText(
                question,
                answer.value(),
                rule.maxLength(),
                violations);
        return new LongTextAnswer(question.id(), normalized);
    }

    private static String validateText(
            SurveyQuestion question,
            String value,
            int maxLength,
            List<SurveyViolation> violations
    ) {
        SurveyAnswerTextNormalizer.NormalizedText normalized =
                SurveyAnswerTextNormalizer.normalize(value);
        String path = answerPath(question.id()) + ".value";
        if (normalized.isBlank()) {
            violations.add(violation(
                    "SURVEY_TEXT_ANSWER_REQUIRED",
                    question.id(),
                    path,
                    "text answer must not be blank"));
        }
        if (normalized.hasForbiddenControlCharacter()) {
            violations.add(violation(
                    "SURVEY_TEXT_CONTROL_CHARACTER_INVALID",
                    question.id(),
                    path,
                    "text contains a forbidden control character"));
        }
        if (normalized.codePointLength() > maxLength) {
            violations.add(violation(
                    "SURVEY_TEXT_TOO_LONG",
                    question.id(),
                    path,
                    "text exceeds the configured maximum length"));
        }
        return normalized.value();
    }

    private static NumberAnswer normalizeNumber(
            SurveyQuestion question,
            NumberAnswer answer,
            List<SurveyViolation> violations
    ) {
        String path = answerPath(question.id()) + ".value";
        if (answer.value() == null) {
            violations.add(violation(
                    "SURVEY_NUMBER_ANSWER_REQUIRED",
                    question.id(),
                    path,
                    "number answer is required"));
            return new NumberAnswer(question.id(), null);
        }
        BigDecimal canonical = canonical(answer.value());
        NumberRule rule = (NumberRule) question.rule();
        if (canonical.compareTo(rule.minimum()) < 0
                || canonical.compareTo(rule.maximum()) > 0) {
            violations.add(violation(
                    "SURVEY_NUMBER_OUT_OF_RANGE",
                    question.id(),
                    path,
                    "number is outside the configured range"));
        }
        int fractionDigits = Math.max(canonical.scale(), 0);
        if (!rule.decimalAllowed() && fractionDigits > 0) {
            violations.add(violation(
                    "SURVEY_NUMBER_DECIMAL_NOT_ALLOWED",
                    question.id(),
                    path,
                    "decimal value is not allowed"));
        } else if (rule.decimalAllowed()
                && fractionDigits > rule.decimalScale()) {
            violations.add(violation(
                    "SURVEY_NUMBER_DECIMAL_SCALE_EXCEEDED",
                    question.id(),
                    path,
                    "number exceeds the configured decimal scale"));
        }
        return new NumberAnswer(question.id(), canonical);
    }

    private static ScaleAnswer normalizeScale(
            SurveyQuestion question,
            ScaleAnswer answer,
            List<SurveyViolation> violations
    ) {
        String path = answerPath(question.id()) + ".value";
        if (answer.value() == null) {
            violations.add(violation(
                    "SURVEY_SCALE_ANSWER_REQUIRED",
                    question.id(),
                    path,
                    "scale answer is required"));
            return new ScaleAnswer(question.id(), null);
        }
        ScaleRule rule = (ScaleRule) question.rule();
        if (answer.value() < rule.minimum()
                || answer.value() > rule.maximum()) {
            violations.add(violation(
                    "SURVEY_SCALE_OUT_OF_RANGE",
                    question.id(),
                    path,
                    "scale is outside the configured range"));
        }
        return new ScaleAnswer(question.id(), answer.value());
    }

    private static boolean matchesType(
            SurveyQuestionType questionType,
            SurveyAnswerType answerType
    ) {
        return questionType.name().equals(answerType.name());
    }

    private static BigDecimal canonical(BigDecimal value) {
        BigDecimal normalized = value.stripTrailingZeros();
        if (normalized.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return normalized.scale() < 0
                ? normalized.setScale(0)
                : normalized;
    }

    private static SurveyViolation violation(
            String code,
            SurveyQuestionId questionId,
            String path,
            String message
    ) {
        return new SurveyViolation(
                code,
                path,
                message,
                Map.of("questionId", questionId.value().toString()));
    }

    private static String answerPath(SurveyQuestionId questionId) {
        return "answers[" + questionId.value() + "]";
    }

    private record NormalizedAnswer(
            int displayOrder,
            SurveyAnswer answer
    ) {
    }
}
