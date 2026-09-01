package com.hamcheeze.vote.survey.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.LongTextRule;
import com.hamcheeze.vote.survey.domain.content.MatrixScaleRule;
import com.hamcheeze.vote.survey.domain.content.MatrixSingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionItem;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
class SurveyJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-01-01T00:00:00Z");
    private static final SurveyActorId ADMIN =
            new SurveyActorId("admin-user");

    @Autowired
    private SurveyContentVersionRepository contentRepository;

    @Autowired
    private SurveyRoundRepository roundRepository;

    @Autowired
    private SurveyResponseRepository responseRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    survey_content_versions,
                    survey_round_control
                CASCADE
                """);
        jdbcTemplate.update("""
                INSERT INTO survey_round_control (control_id, row_version)
                VALUES ('GLOBAL', 0)
                """);
    }

    @AfterEach
    void cleanSurveyData() {
        resetSurveyData();
    }

    @Test
    void contentRepositoryPreservesEveryQuestionTypeAndPublishedImmutability() {
        ContentFixture fixture = contentFixture(100, false);

        SurveyContentVersion savedDraft = contentRepository.save(
                fixture.content());
        SurveyContentVersion changedDraft = savedDraft.replaceDraft(
                "사용자 특성 설문 🌏",
                "Unicode 설명 수정",
                savedDraft.questions(),
                ADMIN,
                NOW.plusSeconds(10));
        SurveyContentVersion updatedDraft = contentRepository.save(
                changedDraft);
        SurveyContentVersion published = updatedDraft.publish(
                new SurveyContentVersionNumber(1),
                ADMIN,
                NOW.plusSeconds(20)).contentVersion();
        SurveyContentVersion stored = contentRepository.save(published);

        assertThat(stored.status())
                .isEqualTo(SurveyContentVersionStatus.PUBLISHED);
        assertThat(stored.rowVersion()).isEqualTo(2);
        assertThat(stored.name()).isEqualTo("사용자 특성 설문 🌏");
        assertThat(stored.questions())
                .extracting(SurveyQuestion::type)
                .containsExactly(
                        SurveyQuestionType.SINGLE_CHOICE,
                        SurveyQuestionType.MULTIPLE_CHOICE,
                        SurveyQuestionType.SHORT_TEXT,
                        SurveyQuestionType.LONG_TEXT,
                        SurveyQuestionType.NUMBER,
                        SurveyQuestionType.SCALE,
                        SurveyQuestionType.MATRIX_SINGLE_CHOICE,
                        SurveyQuestionType.MATRIX_SCALE);
        assertThat(stored.questionSections()).hasSize(8);
        assertThat(stored.questions().get(6).items())
                .extracting(SurveyQuestionItem::itemLabel)
                .containsExactly("아동", "실버");
        assertThat(stored.questions().get(7).description())
                .isEqualTo("0점부터 10점");
        assertThat(stored.questions())
                .extracting(SurveyQuestion::questionKey)
                .doesNotHaveDuplicates();
        assertThat(stored.questions().get(1).options())
                .extracting(SurveyOption::label)
                .containsExactly("개발", "디자인", "기타");
        assertThat(stored.questions().get(1).options())
                .extracting(SurveyOption::localKey)
                .containsExactly("A", "B", "C");
        assertThat(stored.questions().get(4).rule())
                .isEqualTo(new NumberRule(
                        new BigDecimal("-10.50"),
                        new BigDecimal("100.25"),
                        true,
                        2));
        assertThat(stored.questions().get(5).rule())
                .isEqualTo(new ScaleRule(1, 5, "낮음", "높음"));
        assertThat(contentRepository.findPublishedByVersionNumber(
                new SurveyContentVersionNumber(1)))
                .map(SurveyContentVersion::id)
                .contains(stored.id());
        assertThat(contentRepository.findAll()).hasSize(1);

        assertThatThrownBy(() -> contentRepository.save(stored))
                .isInstanceOf(UnsupportedOperationException.class)
                .hasMessageContaining("immutable");
    }

    @Test
    void roundRepositorySupportsOperationalQueriesLocksAndHistory() {
        SurveyContentVersion content = savePublishedContent(200);
        SurveyRound active = roundRepository.save(activeRound(
                201,
                1,
                content.id(),
                NOW.plusSeconds(10)));
        SurveyRound scheduled = roundRepository.save(scheduledRound(
                202,
                2,
                content.id(),
                NOW.plusSeconds(3_600)));
        SurveyRoundTransition transition = SurveyRoundTransition.rehydrate(
                transitionId(203),
                active.id(),
                content.id(),
                SurveyRoundTransitionType.ACTIVATED,
                null,
                SurveyRoundStatus.ACTIVE,
                null,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                null,
                ADMIN,
                SurveyRoundTransitionTrigger.ADMIN_START_NOW,
                "최초 회차 시작",
                NOW.plusSeconds(10),
                null);
        roundRepository.appendTransitions(List.of(transition));

        assertThat(roundRepository.findActive())
                .map(SurveyRound::id)
                .contains(active.id());
        assertThat(roundRepository.findScheduled())
                .map(SurveyRound::id)
                .contains(scheduled.id());
        assertThat(roundRepository.findScheduledDueAt(
                NOW.plusSeconds(3_599))).isEmpty();
        assertThat(roundRepository.findScheduledDueAt(
                NOW.plusSeconds(3_600)))
                .extracting(SurveyRound::id)
                .containsExactly(scheduled.id());
        assertThat(roundRepository.lockGlobalControlForUpdate()).isZero();
        assertThat(roundRepository.findByIdForShare(active.id()))
                .map(SurveyRound::id)
                .contains(active.id());
        assertThat(roundRepository.findTransitions(active.id()))
                .extracting(SurveyRoundTransition::id)
                .containsExactly(transition.id());
    }

    @Test
    void responseRepositoryPreservesAllAnswersAndOrdersHistoryByRound() {
        ContentFixture fixture = contentFixture(300, true);
        SurveyContentVersion content = contentRepository.save(
                fixture.content());
        SurveyRound firstRound = roundRepository.save(activeRound(
                310,
                1,
                content.id(),
                NOW.plusSeconds(10)));
        SurveyUserId userId = new SurveyUserId("user-한글");
        SurveyResponse firstResponse = response(
                320,
                userId,
                firstRound,
                fixture,
                NOW.plusSeconds(20));

        responseRepository.insert(firstResponse);
        SurveyResponse restored = responseRepository.findById(
                firstResponse.id()).orElseThrow();

        assertAllAnswerValues(restored, fixture);
        assertThat(responseRepository.existsByUserIdAndRoundId(
                userId, firstRound.id())).isTrue();
        assertThatThrownBy(() -> responseRepository.insert(firstResponse))
                .isInstanceOf(UnsupportedOperationException.class)
                .hasMessageContaining("immutable");

        SurveyRound secondScheduled = roundRepository.save(scheduledRound(
                311,
                2,
                content.id(),
                NOW.plusSeconds(3_600)));
        SurveyRound firstClosed = SurveyRound.rehydrate(
                firstRound.id(),
                firstRound.roundNumber(),
                firstRound.contentVersionId(),
                SurveyRoundStatus.CLOSED,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                firstRound.activatedAt().orElseThrow(),
                NOW.plusSeconds(3_601),
                null,
                secondScheduled.id(),
                firstRound.createdBy(),
                firstRound.createdAt(),
                firstRound.rowVersion());
        roundRepository.save(firstClosed);
        SurveyRound secondActive = roundRepository.save(
                SurveyRound.rehydrate(
                        secondScheduled.id(),
                        secondScheduled.roundNumber(),
                        secondScheduled.contentVersionId(),
                        SurveyRoundStatus.ACTIVE,
                        SurveyRoundEnforcementMode.ADVISORY,
                        secondScheduled.scheduledAt().orElseThrow(),
                        NOW.plusSeconds(3_601),
                        null,
                        null,
                        null,
                        secondScheduled.createdBy(),
                        secondScheduled.createdAt(),
                        secondScheduled.rowVersion()));
        SurveyResponse secondResponse = response(
                321,
                userId,
                secondActive,
                fixture,
                NOW.plusSeconds(3_620));
        responseRepository.insert(secondResponse);

        assertThat(responseRepository.findLatestByUserId(userId))
                .map(SurveyResponse::id)
                .contains(secondResponse.id());
        assertThat(responseRepository.findAllByUserId(userId))
                .extracting(SurveyResponse::roundNumber)
                .containsExactly(
                        new SurveyRoundNumber(2),
                        new SurveyRoundNumber(1));
    }

    private SurveyContentVersion savePublishedContent(long base) {
        return contentRepository.save(contentFixture(base, true).content());
    }

    private ContentFixture contentFixture(long base, boolean published) {
        SurveyOption singleA = standardOption(base + 11, "아침", 1);
        SurveyOption singleB = standardOption(base + 12, "저녁", 2);
        SurveyOption multipleA = standardOption(base + 21, "개발", 1);
        SurveyOption multipleB = standardOption(base + 22, "디자인", 2);
        SurveyOption multipleOther = SurveyOption.other(
                optionId(base + 23),
                optionLineageId(base + 123),
                3);
        SurveyOption matrixYes = standardOption(base + 31, "있음", 1);
        SurveyOption matrixNo = standardOption(base + 32, "없음", 2);
        List<SurveyQuestionItem> choiceItems = List.of(
                questionItem(base + 41, "child", "아동", 1),
                questionItem(base + 42, "senior", "실버", 2));
        List<SurveyQuestionItem> scaleItems = List.of(
                questionItem(base + 51, "stranger", "처음 만난 낯선 사람", 1),
                questionItem(base + 52, "foreigner", "국내 거주 외국인", 2));
        List<SurveyQuestion> questions = List.of(
                new SurveyQuestion(
                        questionId(base + 1),
                        questionLineageId(base + 101),
                        SurveyQuestionType.SINGLE_CHOICE,
                        "주로 활동하는 시간은 언제인가요?",
                        null,
                        1,
                        true,
                        new SingleChoiceRule(),
                        List.of(singleA, singleB)),
                new SurveyQuestion(
                        questionId(base + 2),
                        questionLineageId(base + 102),
                        SurveyQuestionType.MULTIPLE_CHOICE,
                        "관심 분야를 모두 골라주세요.",
                        "기타 항목에는 직접 입력할 수 있어요.",
                        2,
                        true,
                        new MultipleChoiceRule(1, 3),
                        List.of(multipleA, multipleB, multipleOther)),
                new SurveyQuestion(
                        questionId(base + 3),
                        questionLineageId(base + 103),
                        SurveyQuestionType.SHORT_TEXT,
                        "요즘 가장 큰 관심사는 무엇인가요?",
                        null,
                        3,
                        true,
                        new ShortTextRule(200),
                        List.of()),
                new SurveyQuestion(
                        questionId(base + 4),
                        questionLineageId(base + 104),
                        SurveyQuestionType.LONG_TEXT,
                        "당신을 자유롭게 설명해주세요. 🌏",
                        null,
                        4,
                        true,
                        new LongTextRule(2_000),
                        List.of()),
                new SurveyQuestion(
                        questionId(base + 5),
                        questionLineageId(base + 105),
                        SurveyQuestionType.NUMBER,
                        "선호 온도는 몇 도인가요?",
                        null,
                        5,
                        true,
                        new NumberRule(
                                new BigDecimal("-10.50"),
                                new BigDecimal("100.25"),
                                true,
                                2),
                        List.of()),
                new SurveyQuestion(
                        questionId(base + 6),
                        questionLineageId(base + 106),
                        SurveyQuestionType.SCALE,
                        "새로운 경험을 얼마나 좋아하나요?",
                        null,
                        6,
                        true,
                        new ScaleRule(1, 5, "낮음", "높음"),
                        List.of()),
                new SurveyQuestion(
                        questionId(base + 7),
                        questionLineageId(base + 107),
                        SurveyQuestionType.MATRIX_SINGLE_CHOICE,
                        "가구원 중 해당 연령대가 있습니까?",
                        "각 항목별 1개 선택",
                        7,
                        true,
                        new MatrixSingleChoiceRule(),
                        List.of(matrixYes, matrixNo),
                        choiceItems),
                new SurveyQuestion(
                        questionId(base + 8),
                        questionLineageId(base + 108),
                        SurveyQuestionType.MATRIX_SCALE,
                        "각 집단에 대한 호감도를 평가해 주세요.",
                        "0점부터 10점",
                        8,
                        true,
                        new MatrixScaleRule(0, 10, "비호감", "호감"),
                        List.of(),
                        scaleItems));
        SurveyContentVersion draft = SurveyContentVersion.createDraft(
                contentId(base),
                "사용자 특성 설문",
                "페르소나 생성을 위한 공통 설문",
                questions,
                ADMIN,
                NOW);
        SurveyContentVersion content = published
                ? draft.publish(
                        new SurveyContentVersionNumber(1),
                        ADMIN,
                        NOW.plusSeconds(1)).contentVersion()
                : draft;
        return new ContentFixture(
                content,
                singleA.id(),
                multipleA.id(),
                multipleOther.id());
    }

    private static SurveyResponse response(
            long id,
            SurveyUserId userId,
            SurveyRound round,
            ContentFixture fixture,
            Instant submittedAt
    ) {
        List<SurveyQuestion> questions = fixture.content().questions();
        List<SurveyAnswer> answers = List.of(
                new SingleChoiceAnswer(
                        questions.get(0).id(),
                        new OptionSelection(fixture.singleOptionId(), null)),
                new MultipleChoiceAnswer(
                        questions.get(1).id(),
                        List.of(
                                new OptionSelection(
                                        fixture.multipleOptionId(), null),
                                new OptionSelection(
                                        fixture.otherOptionId(),
                                        "도시 계획 🚲"))),
                new ShortTextAnswer(
                        questions.get(2).id(),
                        "관심사"),
                new LongTextAnswer(
                        questions.get(3).id(),
                        "긴 답변\n유니코드 🌏"),
                new NumberAnswer(
                        questions.get(4).id(),
                        new BigDecimal("12.34")),
                new ScaleAnswer(
                        questions.get(5).id(),
                        4),
                new MatrixSingleChoiceAnswer(
                        questions.get(6).id(),
                        List.of(
                                new MatrixSingleChoiceItemAnswer(
                                        questions.get(6).items().get(0).id(),
                                        new OptionSelection(
                                                questions.get(6).options()
                                                        .get(0).id(),
                                                null)),
                                new MatrixSingleChoiceItemAnswer(
                                        questions.get(6).items().get(1).id(),
                                        new OptionSelection(
                                                questions.get(6).options()
                                                        .get(1).id(),
                                                null)))),
                new MatrixScaleAnswer(
                        questions.get(7).id(),
                        List.of(
                                new MatrixScaleItemAnswer(
                                        questions.get(7).items().get(0).id(),
                                        3),
                                new MatrixScaleItemAnswer(
                                        questions.get(7).items().get(1).id(),
                                        8))));
        return SurveyResponse.rehydrate(
                responseId(id),
                userId,
                round.id(),
                round.roundNumber(),
                round.contentVersionId(),
                submittedAt,
                answers);
    }

    private static void assertAllAnswerValues(
            SurveyResponse response,
            ContentFixture fixture
    ) {
        assertThat(response.answers()).hasSize(8);
        assertThat(((SingleChoiceAnswer) response.answers().get(0))
                .selection().optionId()).isEqualTo(fixture.singleOptionId());
        MultipleChoiceAnswer multiple =
                (MultipleChoiceAnswer) response.answers().get(1);
        assertThat(multiple.selections())
                .extracting(OptionSelection::optionId)
                .containsExactly(
                        fixture.multipleOptionId(),
                        fixture.otherOptionId());
        assertThat(multiple.selections().get(1).inputText())
                .isEqualTo("도시 계획 🚲");
        assertThat(((ShortTextAnswer) response.answers().get(2)).value())
                .isEqualTo("관심사");
        assertThat(((LongTextAnswer) response.answers().get(3)).value())
                .isEqualTo("긴 답변\n유니코드 🌏");
        assertThat(((NumberAnswer) response.answers().get(4)).value())
                .isEqualByComparingTo("12.34");
        assertThat(((ScaleAnswer) response.answers().get(5)).value())
                .isEqualTo(4);
        MatrixSingleChoiceAnswer matrixChoice =
                (MatrixSingleChoiceAnswer) response.answers().get(6);
        assertThat(matrixChoice.itemAnswers())
                .extracting(MatrixSingleChoiceItemAnswer::itemId)
                .containsExactlyElementsOf(fixture.content().questions().get(6)
                        .items().stream()
                        .map(SurveyQuestionItem::id)
                        .toList());
        assertThat(matrixChoice.itemAnswers())
                .extracting(itemAnswer -> itemAnswer.selection().optionId())
                .containsExactlyElementsOf(fixture.content().questions().get(6)
                        .options().stream()
                        .map(SurveyOption::id)
                        .toList());
        MatrixScaleAnswer matrixScale =
                (MatrixScaleAnswer) response.answers().get(7);
        assertThat(matrixScale.itemAnswers())
                .extracting(MatrixScaleItemAnswer::value)
                .containsExactly(3, 8);
    }

    private static SurveyRound activeRound(
            long id,
            int number,
            SurveyContentVersionId contentId,
            Instant activatedAt
    ) {
        return SurveyRound.rehydrate(
                roundId(id),
                new SurveyRoundNumber(number),
                contentId,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                activatedAt,
                null,
                null,
                null,
                ADMIN,
                NOW,
                0);
    }

    private static SurveyRound scheduledRound(
            long id,
            int number,
            SurveyContentVersionId contentId,
            Instant scheduledAt
    ) {
        return SurveyRound.rehydrate(
                roundId(id),
                new SurveyRoundNumber(number),
                contentId,
                SurveyRoundStatus.SCHEDULED,
                null,
                scheduledAt,
                null,
                null,
                null,
                null,
                ADMIN,
                NOW,
                0);
    }

    private static SurveyOption standardOption(
            long value,
            String label,
            int order
    ) {
        return SurveyOption.standard(
                optionId(value),
                optionLineageId(value + 100),
                label,
                order);
    }

    private static SurveyContentVersionId contentId(long value) {
        return new SurveyContentVersionId(uuid(value));
    }

    private static SurveyQuestionId questionId(long value) {
        return new SurveyQuestionId(uuid(value));
    }

    private static SurveyQuestionLineageKey questionLineageId(long value) {
        return new SurveyQuestionLineageKey(uuid(value));
    }

    private static SurveyQuestionItem questionItem(
            long value,
            String key,
            String label,
            int order
    ) {
        return new SurveyQuestionItem(
                new SurveyQuestionItemId(uuid(value)),
                new SurveyQuestionItemLineageKey(uuid(value + 100)),
                key,
                label,
                order);
    }

    private static SurveyOptionId optionId(long value) {
        return new SurveyOptionId(uuid(value));
    }

    private static SurveyOptionLineageKey optionLineageId(long value) {
        return new SurveyOptionLineageKey(uuid(value));
    }

    private static SurveyRoundId roundId(long value) {
        return new SurveyRoundId(uuid(value));
    }

    private static SurveyRoundTransitionId transitionId(long value) {
        return new SurveyRoundTransitionId(uuid(value));
    }

    private static SurveyResponseId responseId(long value) {
        return new SurveyResponseId(uuid(value));
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }

    private record ContentFixture(
            SurveyContentVersion content,
            SurveyOptionId singleOptionId,
            SurveyOptionId multipleOptionId,
            SurveyOptionId otherOptionId
    ) {
    }
}
