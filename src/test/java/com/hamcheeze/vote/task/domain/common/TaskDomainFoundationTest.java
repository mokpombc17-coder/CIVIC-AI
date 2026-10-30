package com.hamcheeze.vote.task.domain.common;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskDomainFoundationTest {

    @Test
    void valueObjectsRejectMissingOrBlankIdentity() {
        assertThatThrownBy(() -> new TaskId(null))
                .isInstanceOf(TaskDomainException.class);
        assertThatThrownBy(() -> new TaskUserId("   "))
                .isInstanceOf(TaskDomainException.class);
        assertThat(new TaskId(new UUID(0, 1)).value())
                .isEqualTo(new UUID(0, 1));
    }

    @Test
    void validationExceptionKeepsImmutableViolations() {
        TaskValidationException exception = new TaskValidationException(
                java.util.List.of(TaskViolation.of(
                        "TASK_INVALID", "field", "invalid")));

        assertThat(exception.violations())
                .extracting(TaskViolation::code)
                .containsExactly("TASK_INVALID");
        assertThatThrownBy(() -> exception.violations().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
