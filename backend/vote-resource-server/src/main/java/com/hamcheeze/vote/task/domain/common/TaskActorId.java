package com.hamcheeze.vote.task.domain.common;

public record TaskActorId(String value) {
    public TaskActorId {
        value = TaskText.required(value, 255, "TASK_ACTOR_ID", "actorId");
    }
}
