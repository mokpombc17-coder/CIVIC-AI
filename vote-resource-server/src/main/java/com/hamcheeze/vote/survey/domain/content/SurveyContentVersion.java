package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionId;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import com.hamcheeze.vote.survey.domain.common.SurveyViolation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

public final class SurveyContentVersion {

    private static final int MAX_NAME_LENGTH = 200;
    private static final int MAX_DESCRIPTION_LENGTH = 1_000;

    private final SurveyContentVersionId id;
    private final SurveyContentVersionNumber versionNumber;
    private final SurveyContentVersionStatus status;
    private final long rowVersion;
    private final String name;
    private final String description;
    private final List<SurveyQuestion> questions;
    private final SurveyContentVersionId derivedFromContentVersionId;
    private final SurveyActorId createdBy;
    private final Instant createdAt;
    private final SurveyActorId lastModifiedBy;
    private final Instant lastModifiedAt;
    private final SurveyActorId publishedBy;
    private final Instant publishedAt;

    private SurveyContentVersion(
            SurveyContentVersionId id,
            SurveyContentVersionNumber versionNumber,
            SurveyContentVersionStatus status,
            long rowVersion,
            String name,
            String description,
            List<SurveyQuestion> questions,
            SurveyContentVersionId derivedFromContentVersionId,
            SurveyActorId createdBy,
            Instant createdAt,
            SurveyActorId lastModifiedBy,
            Instant lastModifiedAt,
            SurveyActorId publishedBy,
            Instant publishedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.versionNumber = versionNumber;
        this.status = Objects.requireNonNull(status, "status");
        if (rowVersion < 0) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_ROW_VERSION_INVALID",
                    "rowVersion",
                    "rowVersion must not be negative");
        }
        this.rowVersion = rowVersion;
        this.name = SurveyContentText.required(
                name,
                MAX_NAME_LENGTH,
                "SURVEY_CONTENT_NAME_REQUIRED",
                "SURVEY_CONTENT_NAME_TOO_LONG",
                "name");
        this.description = SurveyContentText.optional(
                description,
                MAX_DESCRIPTION_LENGTH,
                "SURVEY_CONTENT_DESCRIPTION_TOO_LONG",
                "description");
        this.questions = validateAndOrderQuestions(questions);
        this.derivedFromContentVersionId = derivedFromContentVersionId;
        this.createdBy = Objects.requireNonNull(createdBy, "createdBy");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.lastModifiedBy = Objects.requireNonNull(
                lastModifiedBy,
                "lastModifiedBy");
        this.lastModifiedAt = Objects.requireNonNull(
                lastModifiedAt,
                "lastModifiedAt");
        this.publishedBy = publishedBy;
        this.publishedAt = publishedAt;
        validateLifecycle();
    }

    public static SurveyContentVersion createDraft(
            SurveyContentVersionId id,
            String name,
            String description,
            List<SurveyQuestion> questions,
            SurveyActorId createdBy,
            Instant createdAt
    ) {
        return new SurveyContentVersion(
                id,
                null,
                SurveyContentVersionStatus.DRAFT,
                0,
                name,
                description,
                questions,
                null,
                createdBy,
                createdAt,
                createdBy,
                createdAt,
                null,
                null);
    }

    public static SurveyContentVersion rehydrate(
            SurveyContentVersionId id,
            SurveyContentVersionNumber versionNumber,
            SurveyContentVersionStatus status,
            long rowVersion,
            String name,
            String description,
            List<SurveyQuestion> questions,
            SurveyContentVersionId derivedFromContentVersionId,
            SurveyActorId createdBy,
            Instant createdAt,
            SurveyActorId lastModifiedBy,
            Instant lastModifiedAt,
            SurveyActorId publishedBy,
            Instant publishedAt
    ) {
        return new SurveyContentVersion(
                id,
                versionNumber,
                status,
                rowVersion,
                name,
                description,
                questions,
                derivedFromContentVersionId,
                createdBy,
                createdAt,
                lastModifiedBy,
                lastModifiedAt,
                publishedBy,
                publishedAt);
    }

    public SurveyContentVersion replaceDraft(
            String newName,
            String newDescription,
            List<SurveyQuestion> newQuestions,
            SurveyActorId modifiedBy,
            Instant modifiedAt
    ) {
        requireDraft("replaceDraft");
        Objects.requireNonNull(modifiedBy, "modifiedBy");
        requireNotBefore(modifiedAt, lastModifiedAt, "lastModifiedAt");
        return new SurveyContentVersion(
                id,
                null,
                SurveyContentVersionStatus.DRAFT,
                rowVersion,
                newName,
                newDescription,
                newQuestions,
                derivedFromContentVersionId,
                createdBy,
                createdAt,
                modifiedBy,
                modifiedAt,
                null,
                null);
    }

    public SurveyContentVersionPublication publish(
            SurveyContentVersionNumber assignedVersionNumber,
            SurveyActorId actor,
            Instant at
    ) {
        requireDraft("publish");
        Objects.requireNonNull(assignedVersionNumber, "assignedVersionNumber");
        Objects.requireNonNull(actor, "actor");
        requireNotBefore(at, lastModifiedAt, "publishedAt");
        validateForPublication();
        SurveyContentVersion published = new SurveyContentVersion(
                id,
                assignedVersionNumber,
                SurveyContentVersionStatus.PUBLISHED,
                rowVersion,
                name,
                description,
                questions,
                derivedFromContentVersionId,
                createdBy,
                createdAt,
                lastModifiedBy,
                lastModifiedAt,
                actor,
                at);
        return new SurveyContentVersionPublication(
                published,
                new SurveyContentVersionPublished(
                        id,
                        assignedVersionNumber,
                        actor,
                        at));
    }

    public SurveyContentVersion clonePublishedVersionAsDraft(
            SurveyContentVersionId newId,
            SurveyContentIdGenerator idGenerator,
            SurveyActorId actor,
            Instant at
    ) {
        if (status != SurveyContentVersionStatus.PUBLISHED) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_CLONE_REQUIRES_PUBLISHED",
                    "status",
                    "only a published content version can be cloned");
        }
        Objects.requireNonNull(newId, "newId");
        if (id.equals(newId)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_CLONE_ID_NOT_NEW",
                    "contentVersionId",
                    "clone must have a new contentVersionId");
        }
        Objects.requireNonNull(idGenerator, "idGenerator");
        Objects.requireNonNull(actor, "actor");
        requireNotBefore(at, publishedAt, "createdAt");
        Map<SurveyQuestionSectionId, SurveyQuestionSection> clonedSections =
                new LinkedHashMap<>();
        List<SurveyQuestion> clonedQuestions = questions.stream()
                .map(question -> question.copyWithIds(
                        Objects.requireNonNull(
                                idGenerator.nextQuestionId(),
                                "generated questionId"),
                        clonedSections.computeIfAbsent(
                                question.section().id(),
                                sectionId -> question.section().copyWithId(
                                        Objects.requireNonNull(
                                                idGenerator
                                                        .nextQuestionSectionId(),
                                                "generated sectionId"))),
                        item -> Objects.requireNonNull(
                                idGenerator.nextQuestionItemId(),
                                "generated questionItemId"),
                        option -> Objects.requireNonNull(
                                idGenerator.nextOptionId(),
                                "generated optionId")))
                .toList();
        return new SurveyContentVersion(
                newId,
                null,
                SurveyContentVersionStatus.DRAFT,
                0,
                name,
                description,
                clonedQuestions,
                id,
                actor,
                at,
                actor,
                at,
                null,
                null);
    }

    public SurveyContentVersionId id() {
        return id;
    }

    public Optional<SurveyContentVersionNumber> versionNumber() {
        return Optional.ofNullable(versionNumber);
    }

    public SurveyContentVersionStatus status() {
        return status;
    }

    public long rowVersion() {
        return rowVersion;
    }

    public String name() {
        return name;
    }

    public Optional<String> description() {
        return Optional.ofNullable(description);
    }

    public List<SurveyQuestion> questions() {
        return questions;
    }

    public List<SurveyQuestionSection> questionSections() {
        return questions.stream()
                .map(SurveyQuestion::section)
                .distinct()
                .sorted(Comparator.comparingInt(
                        SurveyQuestionSection::displayOrder))
                .toList();
    }

    public Optional<SurveyContentVersionId> derivedFromContentVersionId() {
        return Optional.ofNullable(derivedFromContentVersionId);
    }

    public SurveyActorId createdBy() {
        return createdBy;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public SurveyActorId lastModifiedBy() {
        return lastModifiedBy;
    }

    public Instant lastModifiedAt() {
        return lastModifiedAt;
    }

    public Optional<SurveyActorId> publishedBy() {
        return Optional.ofNullable(publishedBy);
    }

    public Optional<Instant> publishedAt() {
        return Optional.ofNullable(publishedAt);
    }

    private static List<SurveyQuestion> validateAndOrderQuestions(
            List<SurveyQuestion> questions
    ) {
        Objects.requireNonNull(questions, "questions");
        if (questions.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "questions must not contain null");
        }
        List<SurveyViolation> violations = new ArrayList<>();
        if (questions.size() > SurveyContentLimits.MAX_QUESTIONS) {
            violations.add(SurveyViolation.of(
                    "SURVEY_CONTENT_QUESTION_COUNT_EXCEEDED",
                    "questions",
                    "a content version can have at most "
                            + SurveyContentLimits.MAX_QUESTIONS
                            + " questions"));
        }
        addDuplicateViolation(
                questions,
                SurveyQuestion::id,
                "SURVEY_QUESTION_ID_DUPLICATED",
                "question id must be unique",
                violations);
        addDuplicateViolation(
                questions,
                SurveyQuestion::lineageKey,
                "SURVEY_QUESTION_LINEAGE_DUPLICATED",
                "question lineage must be unique",
                violations);
        addDuplicateViolation(
                questions,
                SurveyQuestion::displayOrder,
                "SURVEY_QUESTION_DISPLAY_ORDER_DUPLICATED",
                "question displayOrder must be unique",
                violations);
        addDuplicateViolation(
                questions,
                SurveyQuestion::questionKey,
                "SURVEY_QUESTION_KEY_DUPLICATED",
                "questionKey must be unique",
                violations);
        Map<SurveyQuestionSectionId, SurveyQuestionSection> sectionsById =
                new LinkedHashMap<>();
        for (SurveyQuestion question : questions) {
            if (question.section().sectionKey().startsWith("legacy.")) {
                continue;
            }
            SurveyQuestionSection previous = sectionsById.putIfAbsent(
                    question.section().id(), question.section());
            if (previous != null && !previous.equals(question.section())) {
                violations.add(SurveyViolation.of(
                        "SURVEY_QUESTION_SECTION_METADATA_INCONSISTENT",
                        "questions",
                        "questions sharing a sectionId must share section metadata"));
            }
        }
        List<SurveyQuestionSection> sections =
                List.copyOf(sectionsById.values());
        addDuplicateViolation(
                sections,
                SurveyQuestionSection::lineageKey,
                "SURVEY_QUESTION_SECTION_LINEAGE_DUPLICATED",
                "section lineage must be unique",
                violations);
        addDuplicateViolation(
                sections,
                SurveyQuestionSection::sectionKey,
                "SURVEY_QUESTION_SECTION_KEY_DUPLICATED",
                "sectionKey must be unique",
                violations);
        addDuplicateViolation(
                sections,
                SurveyQuestionSection::displayOrder,
                "SURVEY_QUESTION_SECTION_DISPLAY_ORDER_DUPLICATED",
                "section displayOrder must be unique",
                violations);
        List<SurveyOption> allOptions = questions.stream()
                .flatMap(question -> question.options().stream())
                .toList();
        addDuplicateViolation(
                allOptions,
                SurveyOption::id,
                "SURVEY_OPTION_ID_DUPLICATED_IN_CONTENT",
                "option id must be unique within a content version",
                violations);
        List<SurveyQuestionItem> allItems = questions.stream()
                .flatMap(question -> question.items().stream())
                .toList();
        addDuplicateViolation(
                allItems,
                SurveyQuestionItem::id,
                "SURVEY_QUESTION_ITEM_ID_DUPLICATED_IN_CONTENT",
                "item id must be unique within a content version",
                violations);
        if (!violations.isEmpty()) {
            throw new SurveyValidationException(violations);
        }
        return questions.stream()
                .sorted(Comparator.comparingInt(SurveyQuestion::displayOrder))
                .toList();
    }

    private static <T, K> void addDuplicateViolation(
            List<T> values,
            Function<T, K> keyExtractor,
            String code,
            String message,
            List<SurveyViolation> violations
    ) {
        Set<K> seen = new HashSet<>();
        boolean duplicated = values.stream()
                .map(keyExtractor)
                .anyMatch(value -> !seen.add(value));
        if (duplicated) {
            violations.add(SurveyViolation.of(
                    code,
                    "questions",
                    message));
        }
    }

    private void validateForPublication() {
        List<SurveyViolation> violations = new ArrayList<>();
        if (questions.isEmpty()) {
            violations.add(SurveyViolation.of(
                    "SURVEY_CONTENT_QUESTIONS_REQUIRED",
                    "questions",
                    "published content must have at least one question"));
        }
        validateAndOrderQuestions(questions);
        if (!violations.isEmpty()) {
            throw new SurveyValidationException(violations);
        }
    }

    private void validateLifecycle() {
        if (lastModifiedAt.isBefore(createdAt)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_AUDIT_TIME_INVALID",
                    "lastModifiedAt",
                    "lastModifiedAt must not be before createdAt");
        }
        if (status == SurveyContentVersionStatus.DRAFT) {
            if (versionNumber != null
                    || publishedBy != null
                    || publishedAt != null) {
                throw SurveyDomainException.invariant(
                        "SURVEY_CONTENT_DRAFT_PUBLICATION_FIELDS_PRESENT",
                        "status",
                        "draft must not have publication fields");
            }
            return;
        }
        if (versionNumber == null || publishedBy == null || publishedAt == null) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_PUBLISHED_FIELDS_REQUIRED",
                    "status",
                    "published content must have publication fields");
        }
        if (questions.isEmpty()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_PUBLISHED_QUESTIONS_REQUIRED",
                    "questions",
                    "published content must have at least one question");
        }
        if (publishedAt.isBefore(lastModifiedAt)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_PUBLISHED_TIME_INVALID",
                    "publishedAt",
                    "publishedAt must not be before lastModifiedAt");
        }
    }

    private void requireDraft(String command) {
        if (status != SurveyContentVersionStatus.DRAFT) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_PUBLISHED_IMMUTABLE",
                    "status",
                    command + " is not allowed for published content");
        }
    }

    private static void requireNotBefore(
            Instant value,
            Instant lowerBound,
            String path
    ) {
        Objects.requireNonNull(value, path);
        if (value.isBefore(lowerBound)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_AUDIT_TIME_INVALID",
                    path,
                    path + " must not move backwards");
        }
    }
}
