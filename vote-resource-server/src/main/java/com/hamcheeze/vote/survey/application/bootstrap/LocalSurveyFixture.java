package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.content.QuestionRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionGroup;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionType;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class LocalSurveyFixture {

    public static final String NAME =
            "AI시민의회 M패널 사용자 특성 기초설문 1회차";
    public static final String DESCRIPTION =
            "정책 확정된 7개 Section, 29개 문항 Group, 42개 저장 Question으로 구성된 공식 1회차 설문입니다.";
    public static final SurveyActorId ACTOR =
            new SurveyActorId("SYSTEM:LOCAL_SURVEY_BOOTSTRAP");
    public static final Instant CREATED_AT =
            Instant.parse("2026-01-01T00:00:00Z");
    public static final SurveyContentVersionId CONTENT_VERSION_ID =
            new SurveyContentVersionId(stableUuid("content-version"));
    public static final SurveyContentVersionNumber CONTENT_VERSION_NUMBER =
            new SurveyContentVersionNumber(1);
    public static final SurveyRoundId ROUND_ID =
            new SurveyRoundId(stableUuid("round"));
    public static final SurveyRoundNumber ROUND_NUMBER =
            new SurveyRoundNumber(1);
    public static final SurveyRoundTransitionId TRANSITION_ID =
            new SurveyRoundTransitionId(stableUuid("transition"));
    public static final String TRANSITION_REASON =
            "[LOCAL] canonical Survey fixture bootstrap";

    private LocalSurveyFixture() {
    }

    public static SurveyContentVersion draft() {
        return SurveyContentVersion.createDraft(
                CONTENT_VERSION_ID,
                NAME,
                DESCRIPTION,
                List.of(),
                ACTOR,
                CREATED_AT);
    }

    public static SurveyContentVersion publishedContent() {
        SurveyContentVersion replaced = draft().replaceDraft(
                NAME,
                DESCRIPTION,
                questions(),
                ACTOR,
                CREATED_AT);
        return replaced.publish(
                CONTENT_VERSION_NUMBER,
                ACTOR,
                CREATED_AT).contentVersion();
    }

    public static List<SurveyQuestion> questions() {
        return RoundOneSurveyFixture.questions();
    }

    public static boolean matchesContent(SurveyContentVersion actual) {
        SurveyContentVersion expected = publishedContent();
        return actual.id().equals(expected.id())
                && actual.versionNumber().equals(expected.versionNumber())
                && actual.status() == SurveyContentVersionStatus.PUBLISHED
                && actual.name().equals(expected.name())
                && actual.description().equals(expected.description())
                && actual.derivedFromContentVersionId().isEmpty()
                && actual.createdBy().equals(expected.createdBy())
                && actual.createdAt().equals(expected.createdAt())
                && actual.lastModifiedBy().equals(expected.lastModifiedBy())
                && actual.lastModifiedAt().equals(expected.lastModifiedAt())
                && actual.publishedBy().equals(expected.publishedBy())
                && actual.publishedAt().equals(expected.publishedAt())
                && questionSnapshots(actual.questions()).equals(
                        questionSnapshots(expected.questions()));
    }

    public static boolean matchesRound(SurveyRound round) {
        return round.id().equals(ROUND_ID)
                && round.roundNumber().equals(ROUND_NUMBER)
                && round.contentVersionId().equals(CONTENT_VERSION_ID)
                && round.status() == SurveyRoundStatus.ACTIVE
                && round.enforcementMode().orElse(null)
                == SurveyRoundEnforcementMode.REQUIRED
                && round.scheduledAt().isEmpty()
                && round.activatedAt().equals(Optional.of(CREATED_AT))
                && round.closedAt().isEmpty()
                && round.canceledAt().isEmpty()
                && round.closedByRoundId().isEmpty()
                && round.createdBy().equals(ACTOR)
                && round.createdAt().equals(CREATED_AT);
    }

    public static boolean matchesTransition(
            SurveyRoundTransition transition
    ) {
        return transition.id().equals(TRANSITION_ID)
                && transition.roundId().equals(ROUND_ID)
                && transition.contentVersionId().equals(CONTENT_VERSION_ID)
                && transition.type() == SurveyRoundTransitionType.ACTIVATED
                && transition.fromStatus().isEmpty()
                && transition.toStatus().orElse(null)
                == SurveyRoundStatus.ACTIVE
                && transition.fromEnforcementMode().isEmpty()
                && transition.toEnforcementMode().orElse(null)
                == SurveyRoundEnforcementMode.REQUIRED
                && transition.previousScheduledAt().isEmpty()
                && transition.newScheduledAt().isEmpty()
                && transition.actorId().equals(ACTOR)
                && transition.trigger()
                == SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP
                && transition.reason().equals(Optional.of(
                TRANSITION_REASON))
                && transition.occurredAt().equals(CREATED_AT)
                && transition.relatedRoundId().isEmpty();
    }

    private static List<QuestionSnapshot> questionSnapshots(
            List<SurveyQuestion> questions
    ) {
        return questions.stream()
                .map(question -> new QuestionSnapshot(
                        question.id(),
                        question.lineageKey(),
                        question.group(),
                        question.itemKey(),
                        question.itemLabel(),
                        question.itemDisplayOrder(),
                        question.type(),
                        question.prompt(),
                        question.description(),
                        question.displayOrder(),
                        question.required(),
                        question.rule(),
                        question.options()))
                .toList();
    }

    private static UUID stableUuid(String key) {
        return UUID.nameUUIDFromBytes(
                ("vote-local-survey-v1:" + key)
                        .getBytes(StandardCharsets.UTF_8));
    }

    private record QuestionSnapshot(
            SurveyQuestionId id,
            SurveyQuestionLineageKey lineageKey,
            SurveyQuestionGroup group,
            String itemKey,
            String itemLabel,
            int itemDisplayOrder,
            SurveyQuestionType type,
            String prompt,
            String description,
            int displayOrder,
            boolean required,
            QuestionRule rule,
            List<SurveyOption> options
    ) {

        private QuestionSnapshot {
            options = List.copyOf(options);
        }
    }
}
