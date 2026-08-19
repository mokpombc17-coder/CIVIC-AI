package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;

import java.util.Optional;

public interface TaskSubmissionRepository {

    TaskSubmission insert(TaskSubmission submission);

    Optional<TaskSubmission> findById(TaskSubmissionId submissionId);

    Optional<TaskSubmission> findByUserAndTask(
            TaskUserId userId,
            TaskId taskId);

    long countByTaskId(TaskId taskId);
}
