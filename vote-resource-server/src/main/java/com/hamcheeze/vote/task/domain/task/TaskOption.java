package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskText;

import java.util.Objects;

public record TaskOption(
        TaskOptionId id,
        int displayOrder,
        TaskOptionKind kind,
        String content
) {

    public static final String DEFAULT_OTHER_CONTENT = "기타";

    public TaskOption {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(kind, "kind");
        if (displayOrder < 1) {
            throw TaskDomainException.invariant(
                    "TASK_OPTION_DISPLAY_ORDER_INVALID",
                    "option.displayOrder",
                    "option displayOrder must be positive");
        }
        content = TaskText.required(
                content,
                TaskLimits.MAX_OPTION_CONTENT_LENGTH,
                "TASK_OPTION_CONTENT",
                "option.content");
    }

    public static TaskOption standard(
            TaskOptionId id,
            int displayOrder,
            String content
    ) {
        return new TaskOption(
                id, displayOrder, TaskOptionKind.STANDARD, content);
    }

    public static TaskOption other(
            TaskOptionId id,
            int displayOrder
    ) {
        return new TaskOption(
                id,
                displayOrder,
                TaskOptionKind.OTHER,
                DEFAULT_OTHER_CONTENT);
    }
}
