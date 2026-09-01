package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionGroup;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionSection;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "survey_content_versions")
class SurveyContentVersionJpaEntity {

    @Id
    @Column(name = "content_version_id", nullable = false)
    private UUID id;

    @Column(name = "version_number")
    private Long versionNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SurveyContentVersionStatus status;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(name = "derived_from_content_version_id")
    private UUID derivedFromContentVersionId;

    @Column(name = "created_by", nullable = false, length = 255)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_modified_by", nullable = false, length = 255)
    private String lastModifiedBy;

    @Column(name = "last_modified_at", nullable = false)
    private Instant lastModifiedAt;

    @Column(name = "published_by", length = 255)
    private String publishedBy;

    @Column(name = "published_at")
    private Instant publishedAt;

    protected SurveyContentVersionJpaEntity() {
    }

    SurveyContentVersionJpaEntity(SurveyContentVersion contentVersion) {
        id = contentVersion.id().value();
        rowVersion = contentVersion.rowVersion();
        apply(contentVersion);
    }

    void apply(SurveyContentVersion contentVersion) {
        versionNumber = contentVersion.versionNumber()
                .map(number -> (long) number.value())
                .orElse(null);
        status = contentVersion.status();
        name = contentVersion.name();
        description = contentVersion.description().orElse(null);
        derivedFromContentVersionId = contentVersion
                .derivedFromContentVersionId()
                .map(id -> id.value())
                .orElse(null);
        createdBy = contentVersion.createdBy().value();
        createdAt = contentVersion.createdAt();
        lastModifiedBy = contentVersion.lastModifiedBy().value();
        lastModifiedAt = contentVersion.lastModifiedAt();
        publishedBy = contentVersion.publishedBy()
                .map(actor -> actor.value())
                .orElse(null);
        publishedAt = contentVersion.publishedAt().orElse(null);
    }

    UUID id() {
        return id;
    }

    Long versionNumber() {
        return versionNumber;
    }

    SurveyContentVersionStatus status() {
        return status;
    }

    long rowVersion() {
        return rowVersion;
    }

    String name() {
        return name;
    }

    String description() {
        return description;
    }

    UUID derivedFromContentVersionId() {
        return derivedFromContentVersionId;
    }

    String createdBy() {
        return createdBy;
    }

    Instant createdAt() {
        return createdAt;
    }

    String lastModifiedBy() {
        return lastModifiedBy;
    }

    Instant lastModifiedAt() {
        return lastModifiedAt;
    }

    String publishedBy() {
        return publishedBy;
    }

    Instant publishedAt() {
        return publishedAt;
    }
}

@Entity
@Table(name = "survey_question_sections")
class SurveyQuestionSectionJpaEntity {

    @Id
    @Column(name = "section_id", nullable = false)
    private UUID id;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "section_lineage_id", nullable = false)
    private UUID lineageId;

    @Column(name = "section_key", nullable = false, length = 150)
    private String sectionKey;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 1000)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    protected SurveyQuestionSectionJpaEntity() {
    }

    SurveyQuestionSectionJpaEntity(
            UUID contentVersionId,
            SurveyQuestionSection section
    ) {
        id = section.id().value();
        this.contentVersionId = contentVersionId;
        lineageId = section.lineageKey().value();
        sectionKey = section.sectionKey();
        title = section.title();
        description = section.description();
        displayOrder = section.displayOrder();
    }

    UUID id() {
        return id;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    UUID lineageId() {
        return lineageId;
    }

    String sectionKey() {
        return sectionKey;
    }

    String title() {
        return title;
    }

    String description() {
        return description;
    }

    int displayOrder() {
        return displayOrder;
    }
}

@Entity
@Table(name = "survey_question_groups")
class SurveyQuestionGroupJpaEntity {

    @Id
    @Column(name = "group_id", nullable = false)
    private UUID id;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "group_lineage_id", nullable = false)
    private UUID lineageId;

    @Column(name = "section_id", nullable = false)
    private UUID sectionId;

    @Column(name = "group_key", nullable = false, length = 150)
    private String groupKey;

    @Column(name = "source_number", nullable = false, length = 20)
    private String sourceNumber;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 1000)
    private String prompt;

    @Column(length = 1000)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    protected SurveyQuestionGroupJpaEntity() {
    }

    SurveyQuestionGroupJpaEntity(
            UUID contentVersionId,
            SurveyQuestionGroup group
    ) {
        id = group.id().value();
        this.contentVersionId = contentVersionId;
        lineageId = group.lineageKey().value();
        sectionId = group.section().id().value();
        groupKey = group.groupKey();
        sourceNumber = group.sourceNumber();
        title = group.title();
        prompt = group.prompt();
        description = group.description();
        displayOrder = group.displayOrder();
    }

    UUID id() {
        return id;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    UUID lineageId() {
        return lineageId;
    }

    UUID sectionId() {
        return sectionId;
    }

    String groupKey() {
        return groupKey;
    }

    String sourceNumber() {
        return sourceNumber;
    }

    String title() {
        return title;
    }

    String prompt() {
        return prompt;
    }

    String description() {
        return description;
    }

    int displayOrder() {
        return displayOrder;
    }
}

@Entity
@Table(name = "survey_questions")
class SurveyQuestionJpaEntity {

    @Id
    @Column(name = "question_id", nullable = false)
    private UUID id;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "question_lineage_id", nullable = false)
    private UUID lineageId;

    @Column(name = "group_id", nullable = false)
    private UUID groupId;

    @Column(name = "item_key", nullable = false, length = 150)
    private String itemKey;

    @Column(name = "item_label", length = 200)
    private String itemLabel;

    @Column(name = "item_display_order", nullable = false)
    private int itemDisplayOrder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SurveyQuestionType type;

    @Column(nullable = false, length = 500)
    private String prompt;

    @Column(length = 1000)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "is_required", nullable = false)
    private boolean required;

    @Column(name = "minimum_selections")
    private Integer minimumSelections;

    @Column(name = "maximum_selections")
    private Integer maximumSelections;

    @Column(name = "text_max_length")
    private Integer textMaxLength;

    @Column(name = "number_minimum", precision = 38, scale = 10)
    private BigDecimal numberMinimum;

    @Column(name = "number_maximum", precision = 38, scale = 10)
    private BigDecimal numberMaximum;

    @Column(name = "decimal_allowed")
    private Boolean decimalAllowed;

    @Column(name = "decimal_scale")
    private Integer decimalScale;

    @Column(name = "scale_minimum")
    private Integer scaleMinimum;

    @Column(name = "scale_maximum")
    private Integer scaleMaximum;

    @Column(name = "scale_minimum_label", length = 200)
    private String scaleMinimumLabel;

    @Column(name = "scale_maximum_label", length = 200)
    private String scaleMaximumLabel;

    protected SurveyQuestionJpaEntity() {
    }

    SurveyQuestionJpaEntity(
            UUID contentVersionId,
            SurveyQuestion question
    ) {
        id = question.id().value();
        this.contentVersionId = contentVersionId;
        lineageId = question.lineageKey().value();
        groupId = question.group().id().value();
        itemKey = question.itemKey();
        itemLabel = question.itemLabel();
        itemDisplayOrder = question.itemDisplayOrder();
        type = question.type();
        prompt = question.prompt();
        description = question.description();
        displayOrder = question.displayOrder();
        required = question.required();
        SurveyContentJpaMapper.copyRuleToEntity(question.rule(), this);
    }

    UUID id() {
        return id;
    }

    UUID contentVersionId() {
        return contentVersionId;
    }

    UUID lineageId() {
        return lineageId;
    }

    UUID groupId() {
        return groupId;
    }

    String itemKey() {
        return itemKey;
    }

    String itemLabel() {
        return itemLabel;
    }

    int itemDisplayOrder() {
        return itemDisplayOrder;
    }

    SurveyQuestionType type() {
        return type;
    }

    String prompt() {
        return prompt;
    }

    String description() {
        return description;
    }

    int displayOrder() {
        return displayOrder;
    }

    boolean required() {
        return required;
    }

    Integer minimumSelections() {
        return minimumSelections;
    }

    void minimumSelections(Integer value) {
        minimumSelections = value;
    }

    Integer maximumSelections() {
        return maximumSelections;
    }

    void maximumSelections(Integer value) {
        maximumSelections = value;
    }

    Integer textMaxLength() {
        return textMaxLength;
    }

    void textMaxLength(Integer value) {
        textMaxLength = value;
    }

    BigDecimal numberMinimum() {
        return numberMinimum;
    }

    void numberMinimum(BigDecimal value) {
        numberMinimum = value;
    }

    BigDecimal numberMaximum() {
        return numberMaximum;
    }

    void numberMaximum(BigDecimal value) {
        numberMaximum = value;
    }

    Boolean decimalAllowed() {
        return decimalAllowed;
    }

    void decimalAllowed(Boolean value) {
        decimalAllowed = value;
    }

    Integer decimalScale() {
        return decimalScale;
    }

    void decimalScale(Integer value) {
        decimalScale = value;
    }

    Integer scaleMinimum() {
        return scaleMinimum;
    }

    void scaleMinimum(Integer value) {
        scaleMinimum = value;
    }

    Integer scaleMaximum() {
        return scaleMaximum;
    }

    void scaleMaximum(Integer value) {
        scaleMaximum = value;
    }

    String scaleMinimumLabel() {
        return scaleMinimumLabel;
    }

    void scaleMinimumLabel(String value) {
        scaleMinimumLabel = value;
    }

    String scaleMaximumLabel() {
        return scaleMaximumLabel;
    }

    void scaleMaximumLabel(String value) {
        scaleMaximumLabel = value;
    }
}

@Entity
@Table(name = "survey_options")
class SurveyOptionJpaEntity {

    @Id
    @Column(name = "option_id", nullable = false)
    private UUID id;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "content_version_id", nullable = false)
    private UUID contentVersionId;

    @Column(name = "option_lineage_id", nullable = false)
    private UUID lineageId;

    @Column(name = "option_local_key", nullable = false, length = 20)
    private String localKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SurveyOptionKind kind;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    protected SurveyOptionJpaEntity() {
    }

    SurveyOptionJpaEntity(
            UUID contentVersionId,
            UUID questionId,
            SurveyOption option
    ) {
        id = option.id().value();
        this.questionId = questionId;
        this.contentVersionId = contentVersionId;
        lineageId = option.lineageKey().value();
        localKey = option.localKey();
        kind = option.kind();
        label = option.label();
        displayOrder = option.displayOrder();
    }

    UUID id() {
        return id;
    }

    UUID questionId() {
        return questionId;
    }

    UUID lineageId() {
        return lineageId;
    }

    String localKey() {
        return localKey;
    }

    SurveyOptionKind kind() {
        return kind;
    }

    String label() {
        return label;
    }

    int displayOrder() {
        return displayOrder;
    }
}
