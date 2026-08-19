package com.hamcheeze.vote.survey.infra.persona;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceErrorCode;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceException;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
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
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.hamcheeze.vote.persona.application.PersonaSurveySource.MultipleChoiceValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.NumberValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.ScaleValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.SingleChoiceValue;
import static com.hamcheeze.vote.persona.application.PersonaSurveySource.TextValue;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonaSurveySourceMapperTest {

    private static final Instant NOW =
            Instant.parse("2026-08-13T00:00:00Z");
    private static final SurveyActorId ADMIN =
            new SurveyActorId("admin");
    private static final SurveyContentVersionId CONTENT_ID =
            new SurveyContentVersionId(uuid(1));
    private static final SurveyRoundId ROUND_ID =
            new SurveyRoundId(uuid(2));
    private static final SurveyResponseId RESPONSE_ID =
            new SurveyResponseId(uuid(3));

    private final PersonaSurveySourceMapper mapper =
            new PersonaSurveySourceMapper();

    @Test
    void assemblesTypedValuesInQuestionAndOptionDisplayOrder() {
        Fixture fixture = fixture();

        PersonaSurveySource source = mapper.map(
                fixture.response(), fixture.round(), fixture.content());

        assertThat(source.responseId())
                .isEqualTo(new PersonaSourceId(RESPONSE_ID.value()));
        assertThat(source.contentVersionNumber())
                .isEqualTo(7);
        assertThat(source.answers())
                .extracting(answer -> answer.question().displayOrder())
                .containsExactly(1, 2, 3, 4, 5);
        assertThat(source.answers())
                .extracting(answer ->
                        answer.value().getClass().getSimpleName())
                .containsExactly(
                        SingleChoiceValue.class.getSimpleName(),
                        MultipleChoiceValue.class.getSimpleName(),
                        TextValue.class.getSimpleName(),
                        NumberValue.class.getSimpleName(),
                        ScaleValue.class.getSimpleName());

        MultipleChoiceValue multiple = (MultipleChoiceValue)
                source.answers().get(1).value();
        assertThat(multiple.selectedOptions())
                .extracting(PersonaSurveySource.PersonaSurveyOption::label)
                .containsExactly("분석", "기타");
        assertThat(multiple.selectedOptions().get(1).inputText())
                .contains("창작");
        assertThat(source.answers().get(2).question().description())
                .contains("정규화된 텍스트");
        assertThat(((TextValue) source.answers().get(2).value()).value())
                .isEqualTo("차분함");
    }

    @Test
    void rejectsResponseRoundAndContentRelationshipMismatch() {
        Fixture fixture = fixture();
        SurveyRound differentRound = round(
                new SurveyContentVersionId(uuid(999)));

        assertIntegrityViolation(() -> mapper.map(
                fixture.response(), differentRound, fixture.content()));
    }

    @Test
    void rejectsQuestionMissingFromReferencedContent() {
        Fixture fixture = fixture();
        SurveyResponse response = response(List.of(new ShortTextAnswer(
                new SurveyQuestionId(uuid(999)), "value")));

        assertIntegrityViolation(() -> mapper.map(
                response, fixture.round(), fixture.content()));
    }

    @Test
    void rejectsOptionMissingFromItsQuestion() {
        Fixture fixture = fixture();
        SurveyQuestion single = fixture.content().questions().getFirst();
        SurveyResponse response = response(List.of(new SingleChoiceAnswer(
                single.id(),
                new OptionSelection(new SurveyOptionId(uuid(999)), null))));

        assertIntegrityViolation(() -> mapper.map(
                response, fixture.round(), fixture.content()));
    }

    @Test
    void rejectsAnswerTypeDifferentFromQuestionType() {
        Fixture fixture = fixture();
        SurveyQuestion single = fixture.content().questions().getFirst();
        SurveyResponse response = response(List.of(new ShortTextAnswer(
                single.id(), "wrong type")));

        assertIntegrityViolation(() -> mapper.map(
                response, fixture.round(), fixture.content()));
    }

    private static void assertIntegrityViolation(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOf(PersonaSurveySourceException.class)
                .extracting("code")
                .isEqualTo(PersonaSurveySourceErrorCode
                        .PERSONA_SURVEY_SOURCE_INTEGRITY_VIOLATION);
    }

    private static Fixture fixture() {
        SurveyOption focus = standardOption(11, "집중", 2);
        SurveyOption calm = standardOption(12, "차분", 1);
        SurveyQuestion single = question(
                21, SurveyQuestionType.SINGLE_CHOICE,
                "선호 성향", null, 1,
                new SingleChoiceRule(), List.of(focus, calm));

        SurveyOption other = SurveyOption.other(
                new SurveyOptionId(uuid(15)),
                new SurveyOptionLineageKey(uuid(115)),
                3);
        SurveyOption analysis = standardOption(13, "분석", 1);
        SurveyOption collaboration = standardOption(14, "협업", 2);
        SurveyQuestion multiple = question(
                22, SurveyQuestionType.MULTIPLE_CHOICE,
                "관심 활동", null, 2,
                new MultipleChoiceRule(1, 3),
                List.of(other, collaboration, analysis));
        SurveyQuestion text = question(
                23, SurveyQuestionType.SHORT_TEXT,
                "한 단어 소개", "정규화된 텍스트", 3,
                ShortTextRule.defaults(), List.of());
        SurveyQuestion number = question(
                24, SurveyQuestionType.NUMBER,
                "하루 집중 시간", null, 4,
                NumberRule.integers(BigDecimal.ZERO, BigDecimal.TEN),
                List.of());
        SurveyQuestion scale = question(
                25, SurveyQuestionType.SCALE,
                "변화 선호", null, 5,
                ScaleRule.defaults(), List.of());

        SurveyContentVersion content = publishedContent(List.of(
                scale, multiple, text, single, number));
        SurveyRound round = round(CONTENT_ID);
        SurveyResponse response = response(List.of(
                new ScaleAnswer(scale.id(), 4),
                new NumberAnswer(number.id(), new BigDecimal("3")),
                new ShortTextAnswer(text.id(), "차분함"),
                new MultipleChoiceAnswer(multiple.id(), List.of(
                        new OptionSelection(other.id(), "창작"),
                        new OptionSelection(analysis.id(), null))),
                new SingleChoiceAnswer(
                        single.id(), new OptionSelection(calm.id(), null))));
        return new Fixture(content, round, response);
    }

    private static SurveyQuestion question(
            long id,
            SurveyQuestionType type,
            String prompt,
            String description,
            int order,
            com.hamcheeze.vote.survey.domain.content.QuestionRule rule,
            List<SurveyOption> options
    ) {
        return new SurveyQuestion(
                new SurveyQuestionId(uuid(id)),
                new SurveyQuestionLineageKey(uuid(id + 1000)),
                type,
                prompt,
                description,
                order,
                true,
                rule,
                options);
    }

    private static SurveyOption standardOption(
            long id,
            String label,
            int order
    ) {
        return SurveyOption.standard(
                new SurveyOptionId(uuid(id)),
                new SurveyOptionLineageKey(uuid(id + 100)),
                label,
                order);
    }

    private static SurveyContentVersion publishedContent(
            List<SurveyQuestion> questions
    ) {
        return SurveyContentVersion.rehydrate(
                CONTENT_ID,
                new SurveyContentVersionNumber(7),
                SurveyContentVersionStatus.PUBLISHED,
                0,
                "사용자 특성 설문",
                null,
                questions,
                null,
                ADMIN,
                NOW.minusSeconds(300),
                ADMIN,
                NOW.minusSeconds(200),
                ADMIN,
                NOW.minusSeconds(100));
    }

    private static SurveyRound round(
            SurveyContentVersionId contentVersionId
    ) {
        return SurveyRound.rehydrate(
                ROUND_ID,
                new SurveyRoundNumber(4),
                contentVersionId,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.ADVISORY,
                null,
                NOW.minusSeconds(50),
                null,
                null,
                null,
                ADMIN,
                NOW.minusSeconds(60),
                0);
    }

    private static SurveyResponse response(List<SurveyAnswer> answers) {
        return SurveyResponse.rehydrate(
                RESPONSE_ID,
                new SurveyUserId("user-1"),
                ROUND_ID,
                new SurveyRoundNumber(4),
                CONTENT_ID,
                NOW,
                answers);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }

    private record Fixture(
            SurveyContentVersion content,
            SurveyRound round,
            SurveyResponse response
    ) {
    }
}
