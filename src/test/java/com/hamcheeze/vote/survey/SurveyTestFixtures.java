package com.hamcheeze.vote.survey;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;

import java.time.Instant;
import java.util.UUID;

public final class SurveyTestFixtures {

    public static final Instant NOW =
            Instant.parse("2026-01-01T00:00:00Z");

    private SurveyTestFixtures() {
    }

    public static SurveyContentVersionId contentVersionId() {
        return new SurveyContentVersionId(uuid(1));
    }

    public static SurveyQuestionId questionId() {
        return new SurveyQuestionId(uuid(2));
    }

    public static SurveyQuestionLineageKey questionLineageKey() {
        return new SurveyQuestionLineageKey(uuid(3));
    }

    public static SurveyOptionId optionId() {
        return new SurveyOptionId(uuid(4));
    }

    public static SurveyOptionLineageKey optionLineageKey() {
        return new SurveyOptionLineageKey(uuid(9));
    }

    public static SurveyActorId actorId() {
        return new SurveyActorId("admin-user");
    }

    public static SurveyRoundId roundId() {
        return new SurveyRoundId(uuid(5));
    }

    public static SurveyRoundTransitionId roundTransitionId() {
        return new SurveyRoundTransitionId(uuid(6));
    }

    public static SurveyResponseId responseId() {
        return new SurveyResponseId(uuid(7));
    }

    public static SurveyReceiptId receiptId() {
        return new SurveyReceiptId(uuid(8));
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
