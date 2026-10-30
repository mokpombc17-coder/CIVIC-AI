package com.hamcheeze.vote.survey.domain.round;

public enum SurveyRoundTransitionTrigger {
    ADMIN_SCHEDULE,
    ADMIN_RESCHEDULE,
    ADMIN_CANCEL,
    ADMIN_START_NOW,
    ADMIN_ENFORCEMENT_CHANGE,
    SCHEDULER,
    SCHEDULER_RECOVERY,
    ADMIN_RECOVERY,
    LOCAL_BOOTSTRAP;

    boolean isScheduler() {
        return this == SCHEDULER || this == SCHEDULER_RECOVERY;
    }
}
