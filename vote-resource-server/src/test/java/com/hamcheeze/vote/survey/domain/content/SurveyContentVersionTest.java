package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.contentVersionId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyContentVersionTest {

    @Test
    void createsEmptyDraftWithCreationAudit() {
        SurveyContentVersion draft = SurveyContentVersion.createDraft(
                contentVersionId(),
                "2026 사용자 특성 Survey",
                null,
                List.of(),
                actorId(),
                NOW);

        assertThat(draft.status()).isEqualTo(SurveyContentVersionStatus.DRAFT);
        assertThat(draft.versionNumber()).isEmpty();
        assertThat(draft.questions()).isEmpty();
        assertThat(draft.createdBy()).isEqualTo(actorId());
        assertThat(draft.lastModifiedAt()).isEqualTo(NOW);
        assertThat(draft.publishedAt()).isEmpty();
    }

    @Test
    void replacesWholeDraftAndUpdatesModificationAudit() {
        SurveyContentVersion original = emptyDraft();
        Instant modifiedAt = NOW.plusSeconds(60);
        SurveyActorId editor = new SurveyActorId("editor-user");

        SurveyContentVersion replaced = original.replaceDraft(
                "새 이름",
                "새 설명",
                List.of(shortTextQuestion(1, 1)),
                editor,
                modifiedAt);

        assertThat(original.questions()).isEmpty();
        assertThat(replaced.questions()).hasSize(1);
        assertThat(replaced.name()).isEqualTo("새 이름");
        assertThat(replaced.description()).contains("새 설명");
        assertThat(replaced.lastModifiedBy()).isEqualTo(editor);
        assertThat(replaced.lastModifiedAt()).isEqualTo(modifiedAt);
    }

    @Test
    void ordersQuestionsAndKeepsReturnedListImmutable() {
        SurveyContentVersion draft = SurveyContentVersion.createDraft(
                contentVersionId(),
                "Survey",
                null,
                List.of(shortTextQuestion(2, 2), shortTextQuestion(1, 1)),
                actorId(),
                NOW);

        assertThat(draft.questions())
                .extracting(SurveyQuestion::displayOrder)
                .containsExactly(1, 2);
        assertThatThrownBy(() -> draft.questions().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void collectsDuplicateQuestionViolations() {
        SurveyQuestion first = shortTextQuestion(1, 1);
        SurveyQuestion duplicate = new SurveyQuestion(
                first.id(),
                first.lineageKey(),
                SurveyQuestionType.SHORT_TEXT,
                "다른 질문",
                null,
                first.displayOrder(),
                true,
                ShortTextRule.defaults(),
                List.of());

        assertThatThrownBy(() -> SurveyContentVersion.createDraft(
                contentVersionId(),
                "Survey",
                null,
                List.of(first, duplicate),
                actorId(),
                NOW))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .containsExactlyInAnyOrder(
                                        "SURVEY_QUESTION_ID_DUPLICATED",
                                        "SURVEY_QUESTION_LINEAGE_DUPLICATED",
                                        "SURVEY_QUESTION_DISPLAY_ORDER_DUPLICATED"));
    }

    @Test
    void refusesToPublishEmptyDraftWithoutChangingIt() {
        SurveyContentVersion draft = emptyDraft();

        assertThatThrownBy(() -> draft.publish(
                new SurveyContentVersionNumber(1),
                actorId(),
                NOW.plusSeconds(60)))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .containsExactly(
                                        "SURVEY_CONTENT_QUESTIONS_REQUIRED"));
        assertThat(draft.status()).isEqualTo(SurveyContentVersionStatus.DRAFT);
        assertThat(draft.versionNumber()).isEmpty();
    }

    @Test
    void publishesValidDraftWithOfficialNumberAuditAndEvent() {
        SurveyContentVersion draft = draftWithQuestion();
        Instant publishedAt = NOW.plusSeconds(60);

        SurveyContentVersionPublication result = draft.publish(
                new SurveyContentVersionNumber(3),
                actorId(),
                publishedAt);

        SurveyContentVersion published = result.contentVersion();
        assertThat(published.status())
                .isEqualTo(SurveyContentVersionStatus.PUBLISHED);
        assertThat(published.versionNumber())
                .contains(new SurveyContentVersionNumber(3));
        assertThat(published.publishedBy()).contains(actorId());
        assertThat(published.publishedAt()).contains(publishedAt);
        assertThat(result.event().contentVersionId())
                .isEqualTo(contentVersionId());
        assertThat(draft.status()).isEqualTo(SurveyContentVersionStatus.DRAFT);
    }

    @Test
    void publishedContentCannotBeModifiedOrRepublished() {
        SurveyContentVersion published = draftWithQuestion()
                .publish(
                        new SurveyContentVersionNumber(1),
                        actorId(),
                        NOW.plusSeconds(60))
                .contentVersion();

        assertThatThrownBy(() -> published.replaceDraft(
                "변경",
                null,
                List.of(shortTextQuestion(2, 1)),
                actorId(),
                NOW.plusSeconds(120)))
                .isInstanceOf(SurveyDomainException.class)
                .hasMessageContaining("not allowed");
        assertThatThrownBy(() -> published.publish(
                new SurveyContentVersionNumber(2),
                actorId(),
                NOW.plusSeconds(120)))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void clonesOnlyPublishedVersionWithNewEntityIdsAndSameLineage() {
        SurveyContentVersion published = draftWithChoiceQuestion()
                .publish(
                        new SurveyContentVersionNumber(1),
                        actorId(),
                        NOW.plusSeconds(60))
                .contentVersion();
        SurveyContentVersionId cloneId =
                new SurveyContentVersionId(new UUID(10, 1));

        SurveyContentVersion clone = published.clonePublishedVersionAsDraft(
                cloneId,
                new SequentialIdGenerator(),
                new SurveyActorId("clone-admin"),
                NOW.plusSeconds(120));

        assertThat(clone.status()).isEqualTo(SurveyContentVersionStatus.DRAFT);
        assertThat(clone.versionNumber()).isEmpty();
        assertThat(clone.publishedBy()).isEmpty();
        assertThat(clone.derivedFromContentVersionId())
                .contains(published.id());
        assertThat(clone.questions().getFirst().id())
                .isNotEqualTo(published.questions().getFirst().id());
        assertThat(clone.questions().getFirst().lineageKey())
                .isEqualTo(published.questions().getFirst().lineageKey());
        assertThat(clone.questionSections().getFirst().id())
                .isNotEqualTo(published.questionSections().getFirst().id());
        assertThat(clone.questionSections().getFirst().lineageKey())
                .isEqualTo(published.questionSections().getFirst()
                        .lineageKey());
        assertThat(clone.questionGroups().getFirst().id())
                .isNotEqualTo(published.questionGroups().getFirst().id());
        assertThat(clone.questionGroups().getFirst().lineageKey())
                .isEqualTo(published.questionGroups().getFirst()
                        .lineageKey());
        assertThat(clone.questionGroups().getFirst().section())
                .isEqualTo(clone.questionSections().getFirst());
        assertThat(clone.questions().getFirst().options())
                .zipSatisfy(
                        published.questions().getFirst().options(),
                        (cloned, source) -> {
                            assertThat(cloned.id()).isNotEqualTo(source.id());
                            assertThat(cloned.lineageKey())
                                    .isEqualTo(source.lineageKey());
                        });
    }

    @Test
    void cannotCloneDraft() {
        assertThatThrownBy(() -> draftWithQuestion()
                .clonePublishedVersionAsDraft(
                        new SurveyContentVersionId(new UUID(10, 1)),
                        new SequentialIdGenerator(),
                        actorId(),
                        NOW.plusSeconds(60)))
                .isInstanceOf(SurveyDomainException.class);
    }

    private static SurveyContentVersion emptyDraft() {
        return SurveyContentVersion.createDraft(
                contentVersionId(),
                "Survey",
                null,
                List.of(),
                actorId(),
                NOW);
    }

    private static SurveyContentVersion draftWithQuestion() {
        return SurveyContentVersion.createDraft(
                contentVersionId(),
                "Survey",
                null,
                List.of(shortTextQuestion(1, 1)),
                actorId(),
                NOW);
    }

    private static SurveyContentVersion draftWithChoiceQuestion() {
        return SurveyContentVersion.createDraft(
                contentVersionId(),
                "Survey",
                null,
                List.of(new SurveyQuestion(
                        questionId(1),
                        questionLineageKey(1),
                        SurveyQuestionType.SINGLE_CHOICE,
                        "선택 질문",
                        null,
                        1,
                        true,
                        new SingleChoiceRule(),
                        List.of(
                                SurveyOption.standard(
                                        optionId(1),
                                        optionLineageKey(1),
                                        "선택 1",
                                        1),
                                SurveyOption.other(
                                        optionId(2),
                                        optionLineageKey(2),
                                        2)))),
                actorId(),
                NOW);
    }

    private static SurveyQuestion shortTextQuestion(
            int idSequence,
            int displayOrder
    ) {
        return new SurveyQuestion(
                questionId(idSequence),
                questionLineageKey(idSequence),
                SurveyQuestionType.SHORT_TEXT,
                "질문 " + idSequence,
                null,
                displayOrder,
                true,
                ShortTextRule.defaults(),
                List.of());
    }

    private static SurveyQuestionId questionId(int sequence) {
        return new SurveyQuestionId(new UUID(3, sequence));
    }

    private static SurveyQuestionLineageKey questionLineageKey(
            int sequence
    ) {
        return new SurveyQuestionLineageKey(new UUID(4, sequence));
    }

    private static SurveyOptionId optionId(int sequence) {
        return new SurveyOptionId(new UUID(5, sequence));
    }

    private static SurveyOptionLineageKey optionLineageKey(int sequence) {
        return new SurveyOptionLineageKey(new UUID(6, sequence));
    }

    private static final class SequentialIdGenerator
            implements SurveyContentIdGenerator {

        private final AtomicLong sequence = new AtomicLong(100);

        @Override
        public com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionId
                nextQuestionSectionId() {
            return new com.hamcheeze.vote.survey.domain.common
                    .SurveyQuestionSectionId(
                    new UUID(5, sequence.incrementAndGet()));
        }

        @Override
        public com.hamcheeze.vote.survey.domain.common.SurveyQuestionGroupId
                nextQuestionGroupId() {
            return new com.hamcheeze.vote.survey.domain.common
                    .SurveyQuestionGroupId(
                    new UUID(10, sequence.incrementAndGet()));
        }

        @Override
        public SurveyQuestionId nextQuestionId() {
            return new SurveyQuestionId(
                    new UUID(20, sequence.incrementAndGet()));
        }

        @Override
        public SurveyOptionId nextOptionId() {
            return new SurveyOptionId(
                    new UUID(30, sequence.incrementAndGet()));
        }
    }
}
