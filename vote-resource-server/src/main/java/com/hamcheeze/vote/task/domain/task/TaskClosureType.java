package com.hamcheeze.vote.task.domain.task;

public enum TaskClosureType {
    DEADLINE_REACHED(true),
    EARLY_CLOSED(true),
    CANCELLED(false),
    MISSED_SCHEDULE(false);

    private final boolean resultEligible;

    TaskClosureType(boolean resultEligible) {
        this.resultEligible = resultEligible;
    }

    public boolean resultEligible() {
        return resultEligible;
    }
}
