package com.hamcheeze.vote.task.application.idempotency;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskIdempotencyKeyTest {

    @Test
    void parsesCanonicalUuidAndUsesSharedConflictCode() {
        UUID value = UUID.randomUUID();

        assertThat(TaskIdempotencyKey.parse(value.toString()).value())
                .isEqualTo(value);
        assertThatThrownBy(() -> TaskIdempotencyKey.parse("not-a-uuid"))
                .isInstanceOfSatisfying(
                        TaskIdempotencyException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(TaskIdempotencyErrorCode
                                        .INVALID_IDEMPOTENCY_KEY));
        assertThat(TaskIdempotencyException.conflict().code())
                .isEqualTo(TaskIdempotencyErrorCode.IDEMPOTENCY_CONFLICT);
    }
}
