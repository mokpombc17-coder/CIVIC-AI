package com.hamcheeze.vote.task.domain.common;

public record TaskUserId(String value) {
    public TaskUserId {
        value = TaskText.required(value, 255, "TASK_USER_ID", "userId");
    }
}
