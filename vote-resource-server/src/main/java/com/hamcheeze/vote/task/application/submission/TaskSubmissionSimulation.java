package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;

/** Optional execution policy for local-only submission simulations. */
public interface TaskSubmissionSimulation {

    boolean supports(TaskUserId userId, TaskId taskId);

    TaskSubmissionService.SubmissionExecution submit(
            TaskUserId userId,
            String idempotencyKey,
            TaskSubmissionService.SubmitTaskCommand command
    );
}
