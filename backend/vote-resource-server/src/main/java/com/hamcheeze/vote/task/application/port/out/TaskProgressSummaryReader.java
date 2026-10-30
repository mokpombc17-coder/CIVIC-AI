package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;

import java.util.List;
import java.util.Objects;

/** Aggregate-only reader for an open Task's current submission counts. */
public interface TaskProgressSummaryReader {

    List<OptionSubmissionCount> countSelections(TaskId taskId);

    record OptionSubmissionCount(TaskOptionId optionId, long count) {

        public OptionSubmissionCount {
            Objects.requireNonNull(optionId, "optionId");
            if (count < 0) {
                throw new IllegalArgumentException(
                        "count must not be negative");
            }
        }
    }
}
