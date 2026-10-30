package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;

final class SurveyRoundTestFixtures {

    private SurveyRoundTestFixtures() {
    }

    static SurveyContentVersion publishedContent() {
        SurveyQuestion question = new SurveyQuestion(
                new SurveyQuestionId(uuid(101)),
                new SurveyQuestionLineageKey(uuid(102)),
                SurveyQuestionType.SHORT_TEXT,
                "현재 관심사를 알려주세요.",
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());
        return SurveyContentVersion.createDraft(
                        new SurveyContentVersionId(uuid(100)),
                        "Round test survey",
                        null,
                        List.of(question),
                        actorId(),
                        NOW)
                .publish(
                        new SurveyContentVersionNumber(1),
                        actorId(),
                        NOW.plusSeconds(1))
                .contentVersion();
    }

    static SurveyContentVersion draftContent() {
        return SurveyContentVersion.createDraft(
                new SurveyContentVersionId(uuid(200)),
                "Draft",
                null,
                List.of(),
                actorId(),
                NOW);
    }

    static SurveyRoundId roundId(int sequence) {
        return new SurveyRoundId(new UUID(40, sequence));
    }

    static SurveyRoundNumber roundNumber(int number) {
        return new SurveyRoundNumber(number);
    }

    static SurveyRoundTransitionId transitionId(int sequence) {
        return new SurveyRoundTransitionId(new UUID(50, sequence));
    }

    static SurveyRoundTransitionIdGenerator transitionIdGenerator() {
        AtomicLong sequence = new AtomicLong(1_000);
        return () -> new SurveyRoundTransitionId(
                new UUID(60, sequence.incrementAndGet()));
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
