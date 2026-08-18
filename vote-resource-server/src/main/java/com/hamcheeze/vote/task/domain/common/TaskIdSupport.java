package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

final class TaskIdSupport {

    private TaskIdSupport() {
    }

    static UUID require(UUID value, String code, String path) {
        if (value == null) {
            throw TaskDomainException.invariant(
                    code,
                    path,
                    path + " must not be null");
        }
        return value;
    }
}
