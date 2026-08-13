package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.content.LongTextRule;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.QuestionRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionType;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class LocalSurveyFixture {

    public static final String NAME = "[LOCAL] 사용자 특성 Survey v1";
    public static final String DESCRIPTION =
            "[LOCAL SAMPLE] 기능 검증 전용 질문입니다. 운영 질문으로 사용하지 않습니다.";
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
        return List.of(
                singleChoice(
                        1,
                        "information.first-check",
                        "새로운 정보를 접했을 때 가장 먼저 확인하는 것은 무엇인가요?",
                        "정보의 출처",
                        "근거가 되는 수치와 데이터",
                        "다른 사람들의 다양한 의견",
                        "전체 맥락과 배경",
                        "나의 경험과 직관"),
                multipleChoice(
                        2,
                        "decision.criteria",
                        "중요한 결정을 내릴 때 고려하는 기준을 골라주세요.",
                        1,
                        3,
                        false,
                        "정확성",
                        "신속성",
                        "안정성",
                        "혁신성",
                        "실현 가능성",
                        "개인에게 미치는 영향",
                        "공동체에 미치는 영향",
                        "공정성"),
                singleChoice(
                        3,
                        "explanation.preferred-style",
                        "가장 이해하기 편한 설명 방식은 무엇인가요?",
                        "결론을 먼저 제시하는 설명",
                        "과정을 단계별로 보여주는 설명",
                        "구체적인 사례 중심 설명",
                        "수치와 표를 활용한 설명",
                        "질문과 답변으로 이어지는 대화형 설명"),
                multipleChoice(
                        4,
                        "interest.topics",
                        "평소 관심 있는 주제를 골라주세요.",
                        1,
                        5,
                        true,
                        "기술",
                        "경제",
                        "환경",
                        "교육",
                        "문화",
                        "과학",
                        "건강 정보",
                        "지역사회",
                        "일과 경력"),
                singleChoice(
                        5,
                        "change.response",
                        "익숙하지 않은 변화가 생기면 주로 어떻게 대응하나요?",
                        "먼저 시도하면서 익힌다",
                        "충분히 조사한 뒤 시도한다",
                        "다른 사람들의 경험을 지켜본다",
                        "필요해졌을 때만 받아들인다"),
                scale(
                        6,
                        "uncertainty.comfort",
                        "불확실한 상황을 편안하게 받아들이는 정도는 어느 정도인가요?"),
                scale(
                        7,
                        "technology.familiarity",
                        "새로운 기술을 익히는 데 얼마나 익숙한가요?"),
                multipleChoice(
                        8,
                        "collaboration.role",
                        "협업할 때 주로 맡고 싶은 역할을 골라주세요.",
                        1,
                        2,
                        false,
                        "계획 수립",
                        "정보 분석",
                        "아이디어 제안",
                        "실행",
                        "의견 조율",
                        "결과 검토"),
                singleChoice(
                        9,
                        "feedback.preferred-style",
                        "어떤 방식의 피드백을 선호하나요?",
                        "핵심을 직접 말해주는 방식",
                        "이유와 근거를 자세히 설명하는 방식",
                        "대안을 함께 제안하는 방식",
                        "질문을 통해 스스로 판단하게 하는 방식",
                        "부드럽고 완곡하게 전달하는 방식"),
                multipleChoice(
                        10,
                        "information.preferred-format",
                        "선호하는 정보 전달 형식을 골라주세요.",
                        1,
                        3,
                        true,
                        "짧은 요약",
                        "자세한 글",
                        "수치와 데이터",
                        "표와 이미지",
                        "영상 또는 음성",
                        "다른 사람과의 대화"),
                question(
                        11,
                        "information.weekly-hours",
                        SurveyQuestionType.NUMBER,
                        "일주일에 새로운 정보를 찾아보는 시간은 대략 몇 시간인가요?",
                        NumberRule.integers(
                                BigDecimal.ZERO,
                                BigDecimal.valueOf(168)),
                        List.of()),
                question(
                        12,
                        "decision.self-description",
                        SurveyQuestionType.SHORT_TEXT,
                        "자신의 의사결정 방식을 한 문장으로 설명해 주세요.",
                        ShortTextRule.defaults(),
                        List.of()),
                question(
                        13,
                        "collaboration.core-value",
                        SurveyQuestionType.SHORT_TEXT,
                        "다른 사람과 함께 일할 때 가장 중요하게 생각하는 가치는 무엇인가요?",
                        ShortTextRule.defaults(),
                        List.of()),
                question(
                        14,
                        "opinion.formation-process",
                        SurveyQuestionType.LONG_TEXT,
                        "복잡한 문제에 대한 의견을 형성할 때 어떤 과정을 거치나요?",
                        LongTextRule.defaults(),
                        List.of()),
                question(
                        15,
                        "future.goal-and-reason",
                        SurveyQuestionType.LONG_TEXT,
                        "앞으로 이루고 싶은 변화나 목표와 그 이유를 설명해 주세요.",
                        LongTextRule.defaults(),
                        List.of()));
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

    private static SurveyQuestion singleChoice(
            int order,
            String lineage,
            String prompt,
            String... optionLabels
    ) {
        return question(
                order,
                lineage,
                SurveyQuestionType.SINGLE_CHOICE,
                prompt,
                new SingleChoiceRule(),
                standardOptions(lineage, optionLabels));
    }

    private static SurveyQuestion multipleChoice(
            int order,
            String lineage,
            String prompt,
            int minimum,
            int maximum,
            boolean allowOther,
            String... optionLabels
    ) {
        List<SurveyOption> options = new java.util.ArrayList<>(
                standardOptions(lineage, optionLabels));
        if (allowOther) {
            int otherOrder = options.size() + 1;
            options.add(SurveyOption.other(
                    optionId(lineage, "other"),
                    optionLineageId(lineage, "other"),
                    otherOrder));
        }
        return question(
                order,
                lineage,
                SurveyQuestionType.MULTIPLE_CHOICE,
                prompt,
                new MultipleChoiceRule(minimum, maximum),
                options);
    }

    private static SurveyQuestion scale(
            int order,
            String lineage,
            String prompt
    ) {
        return question(
                order,
                lineage,
                SurveyQuestionType.SCALE,
                prompt,
                new ScaleRule(
                        1,
                        5,
                        "전혀 그렇지 않다",
                        "매우 그렇다"),
                List.of());
    }

    private static SurveyQuestion question(
            int order,
            String lineage,
            SurveyQuestionType type,
            String prompt,
            QuestionRule rule,
            List<SurveyOption> options
    ) {
        return new SurveyQuestion(
                new SurveyQuestionId(stableUuid("question:" + order)),
                new SurveyQuestionLineageKey(stableUuid(
                        "question-lineage:" + lineage)),
                type,
                prompt,
                null,
                order,
                true,
                rule,
                options);
    }

    private static List<SurveyOption> standardOptions(
            String questionLineage,
            String... labels
    ) {
        java.util.ArrayList<SurveyOption> options =
                new java.util.ArrayList<>();
        for (int index = 0; index < labels.length; index++) {
            String key = "standard:" + (index + 1);
            options.add(SurveyOption.standard(
                    optionId(questionLineage, key),
                    optionLineageId(questionLineage, key),
                    labels[index],
                    index + 1));
        }
        return List.copyOf(options);
    }

    private static SurveyOptionId optionId(
            String questionLineage,
            String optionKey
    ) {
        return new SurveyOptionId(stableUuid(
                "option:" + questionLineage + ":" + optionKey));
    }

    private static SurveyOptionLineageKey optionLineageId(
            String questionLineage,
            String optionKey
    ) {
        return new SurveyOptionLineageKey(stableUuid(
                "option-lineage:" + questionLineage + ":" + optionKey));
    }

    private static List<QuestionSnapshot> questionSnapshots(
            List<SurveyQuestion> questions
    ) {
        return questions.stream()
                .map(question -> new QuestionSnapshot(
                        question.id(),
                        question.lineageKey(),
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
