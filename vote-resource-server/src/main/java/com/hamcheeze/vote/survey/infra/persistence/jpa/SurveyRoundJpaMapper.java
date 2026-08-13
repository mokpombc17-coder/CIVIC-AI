package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;

final class SurveyRoundJpaMapper {

    private SurveyRoundJpaMapper() {
    }

    static SurveyRound toDomain(SurveyRoundJpaEntity round) {
        return SurveyRound.rehydrate(
                new SurveyRoundId(round.id()),
                new SurveyRoundNumber(Math.toIntExact(round.roundNumber())),
                new SurveyContentVersionId(round.contentVersionId()),
                round.status(),
                round.enforcementMode(),
                round.scheduledAt(),
                round.activatedAt(),
                round.closedAt(),
                round.canceledAt(),
                round.closedByRoundId() == null
                        ? null
                        : new SurveyRoundId(round.closedByRoundId()),
                new SurveyActorId(round.createdBy()),
                round.createdAt(),
                round.rowVersion());
    }

    static SurveyRoundTransition toDomain(
            SurveyRoundTransitionJpaEntity transition
    ) {
        return SurveyRoundTransition.rehydrate(
                new SurveyRoundTransitionId(transition.id()),
                new SurveyRoundId(transition.roundId()),
                new SurveyContentVersionId(transition.contentVersionId()),
                transition.type(),
                transition.fromStatus(),
                transition.toStatus(),
                transition.fromEnforcementMode(),
                transition.toEnforcementMode(),
                transition.previousScheduledAt(),
                transition.newScheduledAt(),
                new SurveyActorId(transition.actorId()),
                transition.trigger(),
                transition.reason(),
                transition.occurredAt(),
                transition.relatedRoundId() == null
                        ? null
                        : new SurveyRoundId(transition.relatedRoundId()));
    }
}
